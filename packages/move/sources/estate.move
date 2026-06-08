// Copyright (c) 2026 Bequest
// SPDX-License-Identifier: Apache-2.0

/// The real `Estate`: trustless custody (spike #5) + dead-man's switch (spike #2) +
/// multi-heir atomic distribution (spike #3).
///
/// Custody: assets are escrowed INTO a shared `Estate`. `Coin<T>` is merged into a per-type
/// `Balance<T>` in a dynamic field; `key+store` objects (NFTs, positions) go in an `ObjectBag`,
/// each assigned to a specific heir.
///
/// Dead-man's switch (Sui Clock): ACTIVE --inactivity--> PENDING --grace--> TRIGGERED.
/// Any owner activity (heartbeat / deposit / withdraw) resets to ACTIVE; an executor can pause a
/// PENDING trigger; `arm`/`finalize` are permissionless but time-gated (a keeper can't fire early).
///
/// Distribution (spike #3): after TRIGGERED, anyone (a keeper) PUSHES the inheritance in one PTB:
/// `distribute_coin<T>` splits the escrowed balance across heirs by basis points (last heir gets the
/// rounding remainder); `distribute_object(s)<T>` sends each object to its assigned heir. Sui's
/// limits (verified testnet protocol v124: 1024 commands/PTB, 2048 object transfers/tx, ~50k SUI
/// gas ceiling) sit far above a realistic estate, so a full distribution fits one atomic PTB.
///
/// Framework signatures verified 2026-05-22 against sui-framework `framework/testnet`.
module bequest::estate;

use sui::balance::{Self, Balance};
use sui::clock::{Self, Clock};
use sui::coin::{Self, Coin};
use sui::dynamic_field as df;
use sui::event;
use sui::object_bag::{Self, ObjectBag};
use sui::table::{Self, Table};

const ENotOwner: u64 = 1;
const ENotAHeir: u64 = 2;
const ENotTriggered: u64 = 3;
const EAlreadyTriggered: u64 = 4;
const ENotActive: u64 = 5;
const ENotPending: u64 = 6;
const ETooEarly: u64 = 7;
const ENotExecutor: u64 = 8;
const EBadShares: u64 = 9;
const ENoAccess: u64 = 10;
const EWrongKind: u64 = 11;
const EBadVesting: u64 = 12;
const EVesting: u64 = 13;
const EBadThreshold: u64 = 14;
const ENotGuardian: u64 = 15;
const ENoRecovery: u64 = 16;
const ERecoveryPending: u64 = 17;
const EAlreadyApproved: u64 = 18;

const BPS_TOTAL: u64 = 10000;

const STATUS_ACTIVE: u8 = 0;
const STATUS_PENDING: u8 = 1;
const STATUS_TRIGGERED: u8 = 2;

/// Trigger kinds: an inactivity dead-man's switch (default) or a fixed-date scheduled release.
const KIND_INACTIVITY: u8 = 0;
const KIND_SCHEDULED: u8 = 1;

public struct Heir has store, copy, drop {
    addr: address,
    bps: u64,
}

/// On-chain anchor for the encrypted last-wishes letter: the Walrus blob id, the Seal key id,
/// and a content digest the heir verifies the fetched ciphertext against (so it can't be swapped).
public struct Wishes has store, copy, drop {
    blob_id: vector<u8>,
    key_id: vector<u8>,
    digest: vector<u8>,
}

/// Optional linear-with-cliff vesting for coin distribution, measured from `triggered_at_ms`:
/// nothing releasable before `cliff_ms` elapses, then linear up to 100% at `duration_ms`. Expresses
/// age-gates (cliff == duration) and recurring allowances (claim the unlocked slice over time).
public struct Vesting has store, copy, drop {
    cliff_ms: u64,
    duration_ms: u64,
}

/// A pending guardian-recovery request: rotate the estate's owner to `new_owner` once a quorum of
/// guardians (>= `recovery_threshold`) has approved. Lets the owner regain control if locked out.
public struct Recovery has store, drop {
    new_owner: address,
    approvals: vector<address>,
}

public struct Estate has key {
    id: UID,
    owner: address,
    heirs: vector<Heir>,
    executor: Option<address>,
    status: u8,
    trigger_kind: u8,
    inactivity_ms: u64,
    grace_ms: u64,
    release_at_ms: u64,
    last_active_ms: u64,
    pending_since_ms: u64,
    triggered_at_ms: u64,
    wishes: Option<Wishes>,
    vesting: Option<Vesting>,
    guardians: vector<address>,
    recovery_threshold: u64,
    recovery: Option<Recovery>,
    objects: ObjectBag,
    object_heir: Table<ID, address>,
}

/// Dynamic-field key for the escrowed `Balance<T>` of each coin type.
public struct CoinKey<phantom T> has copy, drop, store {}

/// Dynamic-field key tracking how much of coin type `T` has already been released under vesting.
public struct ClaimedKey<phantom T> has copy, drop, store {}

// Events — let the off-chain keeper discover estates and observe trigger transitions.
public struct EstateCreated has copy, drop { estate: ID, owner: address }
public struct Armed has copy, drop { estate: ID }
public struct Triggered has copy, drop { estate: ID }
/// Canonical SSS events (see docs/sss-v0.md). `Reset` fires on PENDING -> ACTIVE
/// (reason 0 = owner activity, 1 = executor pause); `Claimed` fires per heir payout.
public struct Reset has copy, drop { estate: ID, reason: u8 }
public struct Claimed has copy, drop { estate: ID, recipient: address, amount: u64 }
/// Owner amended the estate (heirs/shares, executor, or timers) while still in control.
public struct EstateUpdated has copy, drop { estate: ID }
/// Owner anchored (or replaced) the encrypted last-wishes letter on-chain.
public struct WishesSet has copy, drop { estate: ID }
/// Guardian-recovery lifecycle: a request is proposed, approved by guardians, and on quorum the
/// owner is rotated (Recovered), or the current owner vetoes it (RecoveryCancelled).
public struct RecoveryProposed has copy, drop { estate: ID, new_owner: address }
public struct RecoveryApproved has copy, drop { estate: ID, guardian: address, approvals: u64 }
public struct Recovered has copy, drop { estate: ID, new_owner: address }
public struct RecoveryCancelled has copy, drop { estate: ID }

/// Create and share an Estate (ACTIVE) as an inactivity dead-man's switch. `heir_addrs[i]` gets
/// `heir_bps[i]` basis points of every coin; the bps must sum to 10000. `executor` is optional.
public fun create_estate(
    heir_addrs: vector<address>,
    heir_bps: vector<u64>,
    executor: Option<address>,
    inactivity_ms: u64,
    grace_ms: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): ID {
    new_estate(heir_addrs, heir_bps, executor, KIND_INACTIVITY, inactivity_ms, grace_ms, 0, clock, ctx)
}

/// Create and share a SCHEDULED estate: it distributes once wall-clock time reaches `release_at_ms`,
/// independent of owner activity (gifting, vesting cliffs). Owner can still withdraw to cancel before then.
public fun create_scheduled_estate(
    heir_addrs: vector<address>,
    heir_bps: vector<u64>,
    executor: Option<address>,
    release_at_ms: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): ID {
    new_estate(heir_addrs, heir_bps, executor, KIND_SCHEDULED, 0, 0, release_at_ms, clock, ctx)
}

fun new_estate(
    heir_addrs: vector<address>,
    heir_bps: vector<u64>,
    executor: Option<address>,
    trigger_kind: u8,
    inactivity_ms: u64,
    grace_ms: u64,
    release_at_ms: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): ID {
    let n = heir_addrs.length();
    assert!(n > 0 && n == heir_bps.length(), EBadShares);
    let mut heirs = vector<Heir>[];
    let mut sum = 0;
    let mut i = 0;
    while (i < n) {
        let bps = heir_bps[i];
        sum = sum + bps;
        heirs.push_back(Heir { addr: heir_addrs[i], bps });
        i = i + 1;
    };
    assert!(sum == BPS_TOTAL, EBadShares);

    let estate = Estate {
        id: object::new(ctx),
        owner: ctx.sender(),
        heirs,
        executor,
        status: STATUS_ACTIVE,
        trigger_kind,
        inactivity_ms,
        grace_ms,
        release_at_ms,
        last_active_ms: clock::timestamp_ms(clock),
        pending_since_ms: 0,
        triggered_at_ms: 0,
        wishes: option::none(),
        vesting: option::none(),
        guardians: vector<address>[],
        recovery_threshold: 0,
        recovery: option::none(),
        objects: object_bag::new(ctx),
        object_heir: table::new(ctx),
    };
    let eid = object::id(&estate);
    event::emit(EstateCreated { estate: eid, owner: estate.owner });
    transfer::share_object(estate);
    eid
}

fun is_heir(estate: &Estate, addr: address): bool {
    let n = estate.heirs.length();
    let mut i = 0;
    while (i < n) {
        if (estate.heirs[i].addr == addr) return true;
        i = i + 1;
    };
    false
}

/// Proof-of-life: reset the timer and clear any pending trigger (owner activity).
fun touch(estate: &mut Estate, clock: &Clock) {
    touch_reason(estate, clock, 0);
}

/// Reset to ACTIVE; emit `Reset` only when this actually cleared a PENDING trigger.
/// reason: 0 = owner activity (heartbeat/deposit/withdraw/cancel), 1 = executor pause.
fun touch_reason(estate: &mut Estate, clock: &Clock, reason: u8) {
    let was_pending = estate.status == STATUS_PENDING;
    estate.last_active_ms = clock::timestamp_ms(clock);
    estate.status = STATUS_ACTIVE;
    estate.pending_since_ms = 0;
    if (was_pending) {
        event::emit(Reset { estate: object::id(estate), reason });
    };
}

public fun heartbeat(estate: &mut Estate, clock: &Clock, ctx: &TxContext) {
    assert!(estate.owner == ctx.sender(), ENotOwner);
    touch(estate, clock);
}

public fun deposit_coin<T>(estate: &mut Estate, c: Coin<T>, clock: &Clock, ctx: &TxContext) {
    assert!(estate.owner == ctx.sender(), ENotOwner);
    assert!(estate.status != STATUS_TRIGGERED, EAlreadyTriggered);
    let key = CoinKey<T> {};
    if (df::exists(&estate.id, key)) {
        let bal: &mut Balance<T> = df::borrow_mut(&mut estate.id, key);
        balance::join(bal, coin::into_balance(c));
    } else {
        df::add(&mut estate.id, key, coin::into_balance(c));
    };
    touch(estate, clock);
}

/// Owner deposits an object earmarked for a specific heir.
public fun deposit_object<T: key + store>(
    estate: &mut Estate,
    obj: T,
    recipient: address,
    clock: &Clock,
    ctx: &TxContext,
) {
    assert!(estate.owner == ctx.sender(), ENotOwner);
    assert!(estate.status != STATUS_TRIGGERED, EAlreadyTriggered);
    assert!(is_heir(estate, recipient), ENotAHeir);
    let id = object::id(&obj);
    object_bag::add(&mut estate.objects, id, obj);
    table::add(&mut estate.object_heir, id, recipient);
    touch(estate, clock);
}

public fun withdraw_coin<T>(
    estate: &mut Estate,
    amount: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<T> {
    assert!(estate.owner == ctx.sender(), ENotOwner);
    assert!(estate.status != STATUS_TRIGGERED, EAlreadyTriggered);
    let bal: &mut Balance<T> = df::borrow_mut(&mut estate.id, CoinKey<T> {});
    let c = coin::take(bal, amount, ctx);
    touch(estate, clock);
    c
}

/// Owner reclaims a deposited object while the estate is not yet TRIGGERED. Counts as activity.
public fun withdraw_object<T: key + store>(
    estate: &mut Estate,
    id: ID,
    clock: &Clock,
    ctx: &mut TxContext,
): T {
    assert!(estate.owner == ctx.sender(), ENotOwner);
    assert!(estate.status != STATUS_TRIGGERED, EAlreadyTriggered);
    let _ = table::remove(&mut estate.object_heir, id);
    let obj = object_bag::remove<ID, T>(&mut estate.objects, id);
    touch(estate, clock);
    obj
}

/// Owner amends the heir set + shares (bps must sum to 10000). Not after TRIGGERED. Counts as activity.
public fun update_heirs(
    estate: &mut Estate,
    heir_addrs: vector<address>,
    heir_bps: vector<u64>,
    clock: &Clock,
    ctx: &TxContext,
) {
    assert!(estate.owner == ctx.sender(), ENotOwner);
    assert!(estate.status != STATUS_TRIGGERED, EAlreadyTriggered);
    let n = heir_addrs.length();
    assert!(n > 0 && n == heir_bps.length(), EBadShares);
    let mut heirs = vector<Heir>[];
    let mut sum = 0;
    let mut i = 0;
    while (i < n) {
        let bps = heir_bps[i];
        sum = sum + bps;
        heirs.push_back(Heir { addr: heir_addrs[i], bps });
        i = i + 1;
    };
    assert!(sum == BPS_TOTAL, EBadShares);
    estate.heirs = heirs;
    event::emit(EstateUpdated { estate: object::id(estate) });
    touch(estate, clock);
}

/// Owner sets/clears the executor. Not after TRIGGERED. Counts as activity.
public fun update_executor(
    estate: &mut Estate,
    executor: Option<address>,
    clock: &Clock,
    ctx: &TxContext,
) {
    assert!(estate.owner == ctx.sender(), ENotOwner);
    assert!(estate.status != STATUS_TRIGGERED, EAlreadyTriggered);
    estate.executor = executor;
    event::emit(EstateUpdated { estate: object::id(estate) });
    touch(estate, clock);
}

/// Owner adjusts the inactivity + grace windows. Not after TRIGGERED. Counts as activity.
public fun update_timers(
    estate: &mut Estate,
    inactivity_ms: u64,
    grace_ms: u64,
    clock: &Clock,
    ctx: &TxContext,
) {
    assert!(estate.owner == ctx.sender(), ENotOwner);
    assert!(estate.status != STATUS_TRIGGERED, EAlreadyTriggered);
    estate.inactivity_ms = inactivity_ms;
    estate.grace_ms = grace_ms;
    event::emit(EstateUpdated { estate: object::id(estate) });
    touch(estate, clock);
}

/// Owner anchors (or replaces) the encrypted last-wishes on-chain: Walrus `blob_id`, Seal `key_id`,
/// and a content `digest` the heir checks the fetched ciphertext against. Not after TRIGGERED.
public fun set_wishes(
    estate: &mut Estate,
    blob_id: vector<u8>,
    key_id: vector<u8>,
    digest: vector<u8>,
    clock: &Clock,
    ctx: &TxContext,
) {
    assert!(estate.owner == ctx.sender(), ENotOwner);
    assert!(estate.status != STATUS_TRIGGERED, EAlreadyTriggered);
    estate.wishes = option::some(Wishes { blob_id, key_id, digest });
    event::emit(WishesSet { estate: object::id(estate) });
    touch(estate, clock);
}

/// Owner enables linear-with-cliff vesting for coin distribution (measured from trigger). When set,
/// coins release via `distribute_coin_vested<T>` instead of the all-at-once `distribute_coin<T>`.
/// `cliff_ms <= duration_ms` and `duration_ms > 0`. Not after TRIGGERED. Counts as activity.
public fun set_vesting(estate: &mut Estate, cliff_ms: u64, duration_ms: u64, clock: &Clock, ctx: &TxContext) {
    assert!(estate.owner == ctx.sender(), ENotOwner);
    assert!(estate.status != STATUS_TRIGGERED, EAlreadyTriggered);
    assert!(duration_ms > 0 && cliff_ms <= duration_ms, EBadVesting);
    estate.vesting = option::some(Vesting { cliff_ms, duration_ms });
    event::emit(EstateUpdated { estate: object::id(estate) });
    touch(estate, clock);
}

/// Fraction (in basis points, 0..10000) of the estate that is releasable now. No vesting => 10000;
/// before TRIGGERED => 0; before the cliff => 0; at/after `duration_ms` => 10000; else linear.
public fun vested_bps(estate: &Estate, clock: &Clock): u64 {
    if (estate.vesting.is_none()) return BPS_TOTAL;
    if (estate.status != STATUS_TRIGGERED) return 0;
    let v = option::borrow(&estate.vesting);
    let elapsed = clock::timestamp_ms(clock) - estate.triggered_at_ms;
    if (elapsed < v.cliff_ms) return 0;
    if (elapsed >= v.duration_ms) return BPS_TOTAL;
    (((elapsed as u128) * (BPS_TOTAL as u128)) / (v.duration_ms as u128)) as u64
}

/// Owner names a guardian set + an m-of-n `threshold` for self-recovery. Amendable; not after TRIGGERED.
public fun set_guardians(
    estate: &mut Estate,
    guardian_addrs: vector<address>,
    threshold: u64,
    clock: &Clock,
    ctx: &TxContext,
) {
    assert!(estate.owner == ctx.sender(), ENotOwner);
    assert!(estate.status != STATUS_TRIGGERED, EAlreadyTriggered);
    assert!(threshold > 0 && threshold <= guardian_addrs.length(), EBadThreshold);
    estate.guardians = guardian_addrs;
    estate.recovery_threshold = threshold;
    event::emit(EstateUpdated { estate: object::id(estate) });
    touch(estate, clock);
}

/// A guardian proposes rotating the owner to `new_owner` (the owner's new key). Records the proposer's
/// approval and executes immediately if the threshold is 1. Not after TRIGGERED.
public fun propose_recovery(estate: &mut Estate, new_owner: address, ctx: &TxContext) {
    assert!(estate.status != STATUS_TRIGGERED, EAlreadyTriggered);
    let sender = ctx.sender();
    assert!(estate.guardians.contains(&sender), ENotGuardian);
    assert!(estate.recovery.is_none(), ERecoveryPending);
    let eid = object::id(estate);
    estate.recovery = option::some(Recovery { new_owner, approvals: vector<address>[sender] });
    event::emit(RecoveryProposed { estate: eid, new_owner });
    try_execute_recovery(estate, eid);
}

/// Another guardian approves the pending recovery; on reaching the threshold the owner rotates.
public fun approve_recovery(estate: &mut Estate, ctx: &TxContext) {
    assert!(estate.status != STATUS_TRIGGERED, EAlreadyTriggered);
    let sender = ctx.sender();
    assert!(estate.guardians.contains(&sender), ENotGuardian);
    assert!(estate.recovery.is_some(), ENoRecovery);
    let eid = object::id(estate);
    let count = {
        let r = option::borrow_mut(&mut estate.recovery);
        assert!(!r.approvals.contains(&sender), EAlreadyApproved);
        r.approvals.push_back(sender);
        r.approvals.length()
    };
    event::emit(RecoveryApproved { estate: eid, guardian: sender, approvals: count });
    try_execute_recovery(estate, eid);
}

/// The current owner vetoes a pending recovery (anti-hijack).
public fun cancel_recovery(estate: &mut Estate, ctx: &TxContext) {
    assert!(estate.owner == ctx.sender(), ENotOwner);
    assert!(estate.recovery.is_some(), ENoRecovery);
    let _ = option::extract(&mut estate.recovery);
    event::emit(RecoveryCancelled { estate: object::id(estate) });
}

fun try_execute_recovery(estate: &mut Estate, eid: ID) {
    let met = option::borrow(&estate.recovery).approvals.length() >= estate.recovery_threshold;
    if (met) {
        let Recovery { new_owner, approvals: _ } = option::extract(&mut estate.recovery);
        estate.owner = new_owner;
        event::emit(Recovered { estate: eid, new_owner });
    }
}

/// Permissionless: ACTIVE -> PENDING once `inactivity_ms` has elapsed since last activity.
/// Only inactivity estates use the arm/finalize path; scheduled estates use `finalize_scheduled`.
public fun arm(estate: &mut Estate, clock: &Clock) {
    assert!(estate.trigger_kind == KIND_INACTIVITY, EWrongKind);
    assert!(estate.status == STATUS_ACTIVE, ENotActive);
    assert!(clock::timestamp_ms(clock) >= estate.last_active_ms + estate.inactivity_ms, ETooEarly);
    estate.status = STATUS_PENDING;
    estate.pending_since_ms = clock::timestamp_ms(clock);
    event::emit(Armed { estate: object::id(estate) });
}

/// Permissionless: PENDING -> TRIGGERED once `grace_ms` has elapsed since arming.
public fun finalize(estate: &mut Estate, clock: &Clock) {
    assert!(estate.status == STATUS_PENDING, ENotPending);
    assert!(clock::timestamp_ms(clock) >= estate.pending_since_ms + estate.grace_ms, ETooEarly);
    estate.status = STATUS_TRIGGERED;
    estate.triggered_at_ms = clock::timestamp_ms(clock);
    event::emit(Triggered { estate: object::id(estate) });
}

/// Permissionless: a SCHEDULED estate goes straight to TRIGGERED once `release_at_ms` is reached.
public fun finalize_scheduled(estate: &mut Estate, clock: &Clock) {
    assert!(estate.trigger_kind == KIND_SCHEDULED, EWrongKind);
    assert!(estate.status != STATUS_TRIGGERED, EAlreadyTriggered);
    assert!(clock::timestamp_ms(clock) >= estate.release_at_ms, ETooEarly);
    estate.status = STATUS_TRIGGERED;
    estate.triggered_at_ms = clock::timestamp_ms(clock);
    event::emit(Triggered { estate: object::id(estate) });
}

public fun cancel_pending(estate: &mut Estate, clock: &Clock, ctx: &TxContext) {
    assert!(estate.owner == ctx.sender(), ENotOwner);
    assert!(estate.status == STATUS_PENDING, ENotPending);
    touch(estate, clock);
}

public fun executor_pause(estate: &mut Estate, clock: &Clock, ctx: &TxContext) {
    let sender = ctx.sender();
    assert!(estate.executor.contains(&sender), ENotExecutor);
    assert!(estate.status == STATUS_PENDING, ENotPending);
    touch_reason(estate, clock, 1);
}

/// Push the full escrowed balance of type T to the heirs by basis points (one PTB command,
/// loops over heirs). Last heir absorbs any rounding remainder. Permissionless after TRIGGERED.
public fun distribute_coin<T>(estate: &mut Estate, ctx: &mut TxContext) {
    assert!(estate.status == STATUS_TRIGGERED, ENotTriggered);
    assert!(estate.vesting.is_none(), EVesting);
    let eid = object::id(estate);
    let bal: Balance<T> = df::remove(&mut estate.id, CoinKey<T> {});
    let mut c = coin::from_balance(bal, ctx);
    let total = coin::value(&c);
    let n = estate.heirs.length();
    let mut i = 0;
    while (i < n - 1) {
        let h = estate.heirs[i];
        let amt = (((total as u128) * (h.bps as u128)) / (BPS_TOTAL as u128)) as u64;
        transfer::public_transfer(coin::split(&mut c, amt, ctx), h.addr);
        event::emit(Claimed { estate: eid, recipient: h.addr, amount: amt });
        i = i + 1;
    };
    // last heir gets the remainder
    let last = estate.heirs[n - 1];
    let last_amt = coin::value(&c);
    transfer::public_transfer(c, last.addr);
    event::emit(Claimed { estate: eid, recipient: last.addr, amount: last_amt });
}

/// Release the currently-unlocked-but-unclaimed slice of coin type T to the heirs by basis points,
/// for a VESTING estate. Permissionless after TRIGGERED; callable repeatedly as more vests (a no-op
/// while nothing new has unlocked). Tracks cumulative released amount in a `ClaimedKey<T>` field.
public fun distribute_coin_vested<T>(estate: &mut Estate, clock: &Clock, ctx: &mut TxContext) {
    assert!(estate.status == STATUS_TRIGGERED, ENotTriggered);
    assert!(estate.vesting.is_some(), EVesting);
    let eid = object::id(estate);

    let bal_ref: &Balance<T> = df::borrow(&estate.id, CoinKey<T> {});
    let remaining = balance::value(bal_ref);
    let claimed = if (df::exists(&estate.id, ClaimedKey<T> {})) {
        let cl: &u64 = df::borrow(&estate.id, ClaimedKey<T> {});
        *cl
    } else {
        0
    };
    let original = remaining + claimed;
    let vbps = vested_bps(estate, clock);
    let unlocked = (((original as u128) * (vbps as u128)) / (BPS_TOTAL as u128)) as u64;
    if (unlocked <= claimed) return;
    let releasable = unlocked - claimed;

    let bal_mut: &mut Balance<T> = df::borrow_mut(&mut estate.id, CoinKey<T> {});
    let mut c = coin::from_balance(balance::split(bal_mut, releasable), ctx);
    let n = estate.heirs.length();
    let mut i = 0;
    while (i < n - 1) {
        let h = estate.heirs[i];
        let amt = (((releasable as u128) * (h.bps as u128)) / (BPS_TOTAL as u128)) as u64;
        transfer::public_transfer(coin::split(&mut c, amt, ctx), h.addr);
        event::emit(Claimed { estate: eid, recipient: h.addr, amount: amt });
        i = i + 1;
    };
    let last = estate.heirs[n - 1];
    let last_amt = coin::value(&c);
    transfer::public_transfer(c, last.addr);
    event::emit(Claimed { estate: eid, recipient: last.addr, amount: last_amt });

    if (df::exists(&estate.id, ClaimedKey<T> {})) {
        let cl: &mut u64 = df::borrow_mut(&mut estate.id, ClaimedKey<T> {});
        *cl = claimed + releasable;
    } else {
        df::add(&mut estate.id, ClaimedKey<T> {}, claimed + releasable);
    };
}

/// Push a single escrowed object to its assigned heir. Permissionless after TRIGGERED.
public fun distribute_object<T: key + store>(estate: &mut Estate, id: ID, ctx: &TxContext) {
    assert!(estate.status == STATUS_TRIGGERED, ENotTriggered);
    let eid = object::id(estate);
    let recipient = table::remove(&mut estate.object_heir, id);
    let obj = object_bag::remove<ID, T>(&mut estate.objects, id);
    transfer::public_transfer(obj, recipient);
    event::emit(Claimed { estate: eid, recipient, amount: 0 });
    let _ = ctx;
}

/// Push many same-type objects in one command (loops). Permissionless after TRIGGERED.
public fun distribute_objects<T: key + store>(estate: &mut Estate, ids: vector<ID>, ctx: &TxContext) {
    assert!(estate.status == STATUS_TRIGGERED, ENotTriggered);
    let eid = object::id(estate);
    let n = ids.length();
    let mut i = 0;
    while (i < n) {
        let id = ids[i];
        let recipient = table::remove(&mut estate.object_heir, id);
        let obj = object_bag::remove<ID, T>(&mut estate.objects, id);
        transfer::public_transfer(obj, recipient);
        event::emit(Claimed { estate: eid, recipient, amount: 0 });
        i = i + 1;
    };
    let _ = ctx;
}

public fun status(estate: &Estate): u8 {
    estate.status
}

public fun heir_count(estate: &Estate): u64 {
    estate.heirs.length()
}

public fun trigger_kind(estate: &Estate): u8 {
    estate.trigger_kind
}

public fun release_at_ms(estate: &Estate): u64 {
    estate.release_at_ms
}

/// The on-chain last-wishes anchor, if the owner set one.
public fun wishes(estate: &Estate): &Option<Wishes> {
    &estate.wishes
}

public fun wishes_blob_id(w: &Wishes): vector<u8> { w.blob_id }
public fun wishes_key_id(w: &Wishes): vector<u8> { w.key_id }
public fun wishes_digest(w: &Wishes): vector<u8> { w.digest }

/// Seal access policy for the encrypted last-wishes: the key servers release the decryption key
/// ONLY when (1) the requested key-id is in this estate's namespace ([pkg id][estate id][nonce]),
/// (2) the estate has been TRIGGERED, and (3) the requester (the Seal session-key address) is a
/// named heir. Called read-only by Seal key servers via dry-run, so `ctx.sender()` is the requester.
entry fun seal_approve(id: vector<u8>, estate: &Estate, ctx: &TxContext) {
    assert!(is_prefix(estate.id.to_bytes(), id), ENoAccess);
    assert!(estate.status == STATUS_TRIGGERED, ENoAccess);
    assert!(is_heir(estate, ctx.sender()), ENoAccess);
}

fun is_prefix(prefix: vector<u8>, word: vector<u8>): bool {
    if (prefix.length() > word.length()) {
        return false
    };
    let mut i = 0;
    while (i < prefix.length()) {
        if (prefix[i] != word[i]) {
            return false
        };
        i = i + 1;
    };
    true
}

// ===== Tests =====

#[test_only]
use sui::test_scenario as ts;
#[test_only]
use sui::sui::SUI;

#[test_only]
public struct Nft has key, store { id: UID }

#[test_only]
const OWNER: address = @0xA;
#[test_only]
const EXECUTOR: address = @0xC;
#[test_only]
const H1: address = @0xD1;
#[test_only]
const H2: address = @0xD2;
#[test_only]
const H3: address = @0xD3;

#[test_only]
fun trigger_now(estate: &mut Estate, clk: &mut Clock) {
    clock::increment_for_testing(clk, 100);
    arm(estate, clk);
    clock::increment_for_testing(clk, 50);
    finalize(estate, clk);
}

#[test]
fun test_multiheir_coin_split() {
    let mut sc = ts::begin(OWNER);
    let mut clk = clock::create_for_testing(sc.ctx());
    // 60 / 30 / 10
    create_estate(vector[H1, H2, H3], vector[6000, 3000, 1000], option::none(), 100, 50, &clk, sc.ctx());

    sc.next_tx(OWNER);
    let mut estate = sc.take_shared<Estate>();
    deposit_coin<SUI>(&mut estate, coin::mint_for_testing<SUI>(1000, sc.ctx()), &clk, sc.ctx());
    trigger_now(&mut estate, &mut clk);
    distribute_coin<SUI>(&mut estate, sc.ctx());
    ts::return_shared(estate);

    // each heir received their share
    sc.next_tx(H1);
    let c1 = sc.take_from_sender<Coin<SUI>>();
    assert!(coin::value(&c1) == 600, 0);
    coin::burn_for_testing(c1);
    sc.next_tx(H2);
    let c2 = sc.take_from_sender<Coin<SUI>>();
    assert!(coin::value(&c2) == 300, 1);
    coin::burn_for_testing(c2);
    sc.next_tx(H3);
    let c3 = sc.take_from_sender<Coin<SUI>>();
    assert!(coin::value(&c3) == 100, 2);
    coin::burn_for_testing(c3);

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test]
/// Spike #3 scale: 5 heirs + 100 NFTs distributed in one finalize+distribute flow, well under
/// the 1024-command / 2048-object PTB ceilings. Proves the loop handles scale without aborting.
fun test_largescale_distribution() {
    let heirs = vector[@0xE1, @0xE2, @0xE3, @0xE4, @0xE5];
    let mut sc = ts::begin(OWNER);
    let mut clk = clock::create_for_testing(sc.ctx());
    create_estate(heirs, vector[2000, 2000, 2000, 2000, 2000], option::none(), 100, 50, &clk, sc.ctx());

    sc.next_tx(OWNER);
    let mut estate = sc.take_shared<Estate>();
    deposit_coin<SUI>(&mut estate, coin::mint_for_testing<SUI>(1_000_000, sc.ctx()), &clk, sc.ctx());

    let count = 100;
    let mut ids = vector<ID>[];
    let mut i = 0;
    while (i < count) {
        let nft = Nft { id: object::new(sc.ctx()) };
        let id = object::id(&nft);
        ids.push_back(id);
        // round-robin assign to the 5 heirs
        deposit_object(&mut estate, nft, heirs[i % 5], &clk, sc.ctx());
        i = i + 1;
    };

    trigger_now(&mut estate, &mut clk);
    distribute_coin<SUI>(&mut estate, sc.ctx());
    distribute_objects<Nft>(&mut estate, ids, sc.ctx());
    assert!(object_bag::is_empty(&estate.objects), 0);
    ts::return_shared(estate);

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test, expected_failure(abort_code = EBadShares)]
fun test_bad_shares_rejected() {
    let mut sc = ts::begin(OWNER);
    let mut clk = clock::create_for_testing(sc.ctx());
    // 60 + 30 = 90% != 100% -> abort
    create_estate(vector[H1, H2], vector[6000, 3000], option::none(), 100, 50, &clk, sc.ctx());
    clock::destroy_for_testing(clk);
    sc.end();
}

#[test]
fun test_executor_pause_resets() {
    let mut sc = ts::begin(OWNER);
    let mut clk = clock::create_for_testing(sc.ctx());
    create_estate(vector[H1], vector[10000], option::some(EXECUTOR), 100, 50, &clk, sc.ctx());

    sc.next_tx(OWNER);
    let mut estate = sc.take_shared<Estate>();
    clock::increment_for_testing(&mut clk, 100);
    arm(&mut estate, &clk);
    assert!(estate.status() == STATUS_PENDING, 0);
    ts::return_shared(estate);

    sc.next_tx(EXECUTOR);
    let mut estate = sc.take_shared<Estate>();
    executor_pause(&mut estate, &clk, sc.ctx());
    assert!(estate.status() == STATUS_ACTIVE, 1);
    ts::return_shared(estate);

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test, expected_failure(abort_code = ETooEarly)]
fun test_heartbeat_defers_trigger() {
    let mut sc = ts::begin(OWNER);
    let mut clk = clock::create_for_testing(sc.ctx());
    create_estate(vector[H1], vector[10000], option::none(), 100, 50, &clk, sc.ctx());

    sc.next_tx(OWNER);
    let mut estate = sc.take_shared<Estate>();
    clock::increment_for_testing(&mut clk, 90);
    heartbeat(&mut estate, &clk, sc.ctx());
    clock::increment_for_testing(&mut clk, 90); // now 180; deadline 90 + 100 = 190
    arm(&mut estate, &clk); // aborts ETooEarly
    ts::return_shared(estate);
    clock::destroy_for_testing(clk);
    sc.end();
}

#[test, expected_failure(abort_code = ETooEarly)]
fun test_cannot_finalize_before_grace() {
    let mut sc = ts::begin(OWNER);
    let mut clk = clock::create_for_testing(sc.ctx());
    create_estate(vector[H1], vector[10000], option::none(), 100, 50, &clk, sc.ctx());
    sc.next_tx(OWNER);
    let mut estate = sc.take_shared<Estate>();
    clock::increment_for_testing(&mut clk, 100);
    arm(&mut estate, &clk);
    clock::increment_for_testing(&mut clk, 10);
    finalize(&mut estate, &clk); // aborts ETooEarly
    ts::return_shared(estate);
    clock::destroy_for_testing(clk);
    sc.end();
}

#[test, expected_failure(abort_code = EAlreadyTriggered)]
fun test_owner_cannot_withdraw_after_trigger() {
    let mut sc = ts::begin(OWNER);
    let mut clk = clock::create_for_testing(sc.ctx());
    create_estate(vector[H1], vector[10000], option::none(), 100, 50, &clk, sc.ctx());
    sc.next_tx(OWNER);
    let mut estate = sc.take_shared<Estate>();
    deposit_coin<SUI>(&mut estate, coin::mint_for_testing<SUI>(1000, sc.ctx()), &clk, sc.ctx());
    trigger_now(&mut estate, &mut clk);
    let c = withdraw_coin<SUI>(&mut estate, 100, &clk, sc.ctx()); // aborts EAlreadyTriggered
    coin::burn_for_testing(c);
    ts::return_shared(estate);
    clock::destroy_for_testing(clk);
    sc.end();
}

#[test]
fun test_distribute_object_to_assigned_heir() {
    let mut sc = ts::begin(OWNER);
    let mut clk = clock::create_for_testing(sc.ctx());
    create_estate(vector[H1, H2], vector[5000, 5000], option::none(), 100, 50, &clk, sc.ctx());

    sc.next_tx(OWNER);
    let mut estate = sc.take_shared<Estate>();
    let nft = Nft { id: object::new(sc.ctx()) };
    let id = object::id(&nft);
    deposit_object(&mut estate, nft, H2, &clk, sc.ctx()); // earmarked for H2
    trigger_now(&mut estate, &mut clk);
    distribute_object<Nft>(&mut estate, id, sc.ctx());
    assert!(object_bag::is_empty(&estate.objects), 0);
    ts::return_shared(estate);

    sc.next_tx(H2);
    let got = sc.take_from_sender<Nft>();
    assert!(object::id(&got) == id, 1);
    let Nft { id: uid } = got;
    object::delete(uid);

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test, expected_failure(abort_code = ENoAccess)]
fun test_seal_denied_while_active() {
    let mut sc = ts::begin(OWNER);
    let clk = clock::create_for_testing(sc.ctx());
    create_estate(vector[H1], vector[10000], option::none(), 100, 50, &clk, sc.ctx());

    sc.next_tx(OWNER);
    let estate = sc.take_shared<Estate>();
    let mut key = estate.id.to_bytes(); // valid namespace: [estate id][nonce]
    key.push_back(0u8);
    seal_approve(key, &estate, sc.ctx()); // ACTIVE -> aborts ENoAccess
    ts::return_shared(estate);
    clock::destroy_for_testing(clk);
    sc.end();
}

#[test]
fun test_seal_allowed_after_trigger() {
    let mut sc = ts::begin(OWNER);
    let mut clk = clock::create_for_testing(sc.ctx());
    create_estate(vector[H1], vector[10000], option::none(), 100, 50, &clk, sc.ctx());

    sc.next_tx(OWNER);
    let mut estate = sc.take_shared<Estate>();
    trigger_now(&mut estate, &mut clk);
    ts::return_shared(estate);

    // The requester (Seal session-key address) must be a named heir.
    sc.next_tx(H1);
    let estate = sc.take_shared<Estate>();
    let mut key = estate.id.to_bytes();
    key.push_back(7u8);
    seal_approve(key, &estate, sc.ctx()); // TRIGGERED + valid namespace + heir -> succeeds
    ts::return_shared(estate);
    clock::destroy_for_testing(clk);
    sc.end();
}

#[test, expected_failure(abort_code = ENoAccess)]
fun test_seal_denied_wrong_namespace() {
    let mut sc = ts::begin(OWNER);
    let mut clk = clock::create_for_testing(sc.ctx());
    create_estate(vector[H1], vector[10000], option::none(), 100, 50, &clk, sc.ctx());

    sc.next_tx(OWNER);
    let mut estate = sc.take_shared<Estate>();
    trigger_now(&mut estate, &mut clk);
    // key-id NOT in the estate namespace -> denied even though TRIGGERED
    seal_approve(vector[0u8, 1u8, 2u8, 3u8], &estate, sc.ctx());
    ts::return_shared(estate);
    clock::destroy_for_testing(clk);
    sc.end();
}

#[test, expected_failure(abort_code = ENoAccess)]
fun test_seal_denied_non_heir() {
    let mut sc = ts::begin(OWNER);
    let mut clk = clock::create_for_testing(sc.ctx());
    create_estate(vector[H1], vector[10000], option::none(), 100, 50, &clk, sc.ctx());

    sc.next_tx(OWNER);
    let mut estate = sc.take_shared<Estate>();
    trigger_now(&mut estate, &mut clk);
    ts::return_shared(estate);

    // A stranger with a valid namespace key is still denied: not a named heir.
    sc.next_tx(@0xBAD);
    let estate = sc.take_shared<Estate>();
    let mut key = estate.id.to_bytes();
    key.push_back(7u8);
    seal_approve(key, &estate, sc.ctx());
    ts::return_shared(estate);
    clock::destroy_for_testing(clk);
    sc.end();
}

#[test]
fun test_update_heirs_then_distribute() {
    let mut sc = ts::begin(OWNER);
    let mut clk = clock::create_for_testing(sc.ctx());
    create_estate(vector[H1], vector[10000], option::none(), 100, 50, &clk, sc.ctx());

    sc.next_tx(OWNER);
    let mut estate = sc.take_shared<Estate>();
    update_heirs(&mut estate, vector[H1, H2], vector[4000, 6000], &clk, sc.ctx());
    assert!(estate.heir_count() == 2, 0);
    deposit_coin<SUI>(&mut estate, coin::mint_for_testing<SUI>(1000, sc.ctx()), &clk, sc.ctx());
    trigger_now(&mut estate, &mut clk);
    distribute_coin<SUI>(&mut estate, sc.ctx());
    ts::return_shared(estate);

    sc.next_tx(H1);
    let c1 = sc.take_from_sender<Coin<SUI>>();
    assert!(coin::value(&c1) == 400, 1);
    coin::burn_for_testing(c1);
    sc.next_tx(H2);
    let c2 = sc.take_from_sender<Coin<SUI>>();
    assert!(coin::value(&c2) == 600, 2);
    coin::burn_for_testing(c2);

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test]
fun test_withdraw_object_returns_to_owner() {
    let mut sc = ts::begin(OWNER);
    let mut clk = clock::create_for_testing(sc.ctx());
    create_estate(vector[H1], vector[10000], option::none(), 100, 50, &clk, sc.ctx());

    sc.next_tx(OWNER);
    let mut estate = sc.take_shared<Estate>();
    let nft = Nft { id: object::new(sc.ctx()) };
    let id = object::id(&nft);
    deposit_object(&mut estate, nft, H1, &clk, sc.ctx());
    let back = withdraw_object<Nft>(&mut estate, id, &clk, sc.ctx());
    assert!(object::id(&back) == id, 0);
    assert!(object_bag::is_empty(&estate.objects), 1);
    let Nft { id: uid } = back;
    object::delete(uid);
    ts::return_shared(estate);

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test, expected_failure(abort_code = EBadShares)]
fun test_update_heirs_bad_shares() {
    let mut sc = ts::begin(OWNER);
    let mut clk = clock::create_for_testing(sc.ctx());
    create_estate(vector[H1], vector[10000], option::none(), 100, 50, &clk, sc.ctx());
    sc.next_tx(OWNER);
    let mut estate = sc.take_shared<Estate>();
    update_heirs(&mut estate, vector[H1, H2], vector[4000, 5000], &clk, sc.ctx()); // 90% -> abort
    ts::return_shared(estate);
    clock::destroy_for_testing(clk);
    sc.end();
}

#[test, expected_failure(abort_code = EAlreadyTriggered)]
fun test_cannot_update_heirs_after_trigger() {
    let mut sc = ts::begin(OWNER);
    let mut clk = clock::create_for_testing(sc.ctx());
    create_estate(vector[H1], vector[10000], option::none(), 100, 50, &clk, sc.ctx());
    sc.next_tx(OWNER);
    let mut estate = sc.take_shared<Estate>();
    trigger_now(&mut estate, &mut clk);
    update_heirs(&mut estate, vector[H2], vector[10000], &clk, sc.ctx()); // aborts EAlreadyTriggered
    ts::return_shared(estate);
    clock::destroy_for_testing(clk);
    sc.end();
}

#[test]
fun test_scheduled_release_distributes() {
    let mut sc = ts::begin(OWNER);
    let mut clk = clock::create_for_testing(sc.ctx());
    create_scheduled_estate(vector[H1], vector[10000], option::none(), 1000, &clk, sc.ctx());

    sc.next_tx(OWNER);
    let mut estate = sc.take_shared<Estate>();
    assert!(estate.trigger_kind() == KIND_SCHEDULED, 0);
    deposit_coin<SUI>(&mut estate, coin::mint_for_testing<SUI>(500, sc.ctx()), &clk, sc.ctx());
    clock::increment_for_testing(&mut clk, 1000); // reaches release_at_ms
    finalize_scheduled(&mut estate, &clk);
    assert!(estate.status() == STATUS_TRIGGERED, 1);
    distribute_coin<SUI>(&mut estate, sc.ctx());
    ts::return_shared(estate);

    sc.next_tx(H1);
    let c = sc.take_from_sender<Coin<SUI>>();
    assert!(coin::value(&c) == 500, 2);
    coin::burn_for_testing(c);
    clock::destroy_for_testing(clk);
    sc.end();
}

#[test, expected_failure(abort_code = ETooEarly)]
fun test_scheduled_finalize_too_early() {
    let mut sc = ts::begin(OWNER);
    let mut clk = clock::create_for_testing(sc.ctx());
    create_scheduled_estate(vector[H1], vector[10000], option::none(), 1000, &clk, sc.ctx());
    sc.next_tx(OWNER);
    let mut estate = sc.take_shared<Estate>();
    clock::increment_for_testing(&mut clk, 500); // before release
    finalize_scheduled(&mut estate, &clk); // aborts ETooEarly
    ts::return_shared(estate);
    clock::destroy_for_testing(clk);
    sc.end();
}

#[test, expected_failure(abort_code = EWrongKind)]
fun test_arm_rejects_scheduled() {
    let mut sc = ts::begin(OWNER);
    let mut clk = clock::create_for_testing(sc.ctx());
    create_scheduled_estate(vector[H1], vector[10000], option::none(), 1000, &clk, sc.ctx());
    sc.next_tx(OWNER);
    let mut estate = sc.take_shared<Estate>();
    clock::increment_for_testing(&mut clk, 1000);
    arm(&mut estate, &clk); // aborts EWrongKind (scheduled estates don't use arm/finalize)
    ts::return_shared(estate);
    clock::destroy_for_testing(clk);
    sc.end();
}

#[test]
fun test_set_wishes_anchors_digest() {
    let mut sc = ts::begin(OWNER);
    let mut clk = clock::create_for_testing(sc.ctx());
    create_estate(vector[H1], vector[10000], option::none(), 100, 50, &clk, sc.ctx());

    sc.next_tx(OWNER);
    let mut estate = sc.take_shared<Estate>();
    let digest = vector[1u8, 2u8, 3u8, 4u8];
    set_wishes(&mut estate, b"blob123", b"keyid456", digest, &clk, sc.ctx());
    let w = option::borrow(estate.wishes());
    assert!(wishes_digest(w) == vector[1u8, 2u8, 3u8, 4u8], 0);
    assert!(wishes_blob_id(w) == b"blob123", 1);
    ts::return_shared(estate);
    clock::destroy_for_testing(clk);
    sc.end();
}

#[test]
fun test_vested_bps_cliff_and_full() {
    let mut sc = ts::begin(OWNER);
    let mut clk = clock::create_for_testing(sc.ctx());
    create_estate(vector[H1], vector[10000], option::none(), 100, 50, &clk, sc.ctx());
    sc.next_tx(OWNER);
    let mut estate = sc.take_shared<Estate>();
    set_vesting(&mut estate, 500, 1000, &clk, sc.ctx());
    assert!(estate.vested_bps(&clk) == 0, 0); // not triggered -> 0
    trigger_now(&mut estate, &mut clk); // triggered_at set
    assert!(estate.vested_bps(&clk) == 0, 1); // elapsed 0 < cliff 500
    clock::increment_for_testing(&mut clk, 500); // elapsed 500 -> 50%
    assert!(estate.vested_bps(&clk) == 5000, 2);
    clock::increment_for_testing(&mut clk, 600); // elapsed 1100 >= duration -> 100%
    assert!(estate.vested_bps(&clk) == 10000, 3);
    ts::return_shared(estate);
    clock::destroy_for_testing(clk);
    sc.end();
}

#[test]
fun test_vesting_releases_linearly() {
    let mut sc = ts::begin(OWNER);
    let mut clk = clock::create_for_testing(sc.ctx());
    create_estate(vector[H1, H2], vector[7000, 3000], option::none(), 100, 50, &clk, sc.ctx());
    sc.next_tx(OWNER);
    let mut estate = sc.take_shared<Estate>();
    set_vesting(&mut estate, 0, 1000, &clk, sc.ctx());
    deposit_coin<SUI>(&mut estate, coin::mint_for_testing<SUI>(1000, sc.ctx()), &clk, sc.ctx());
    trigger_now(&mut estate, &mut clk);
    clock::increment_for_testing(&mut clk, 500); // 50% vested
    distribute_coin_vested<SUI>(&mut estate, &clk, sc.ctx()); // releases 500 (350/150)
    clock::increment_for_testing(&mut clk, 600); // 100% vested
    distribute_coin_vested<SUI>(&mut estate, &clk, sc.ctx()); // releases remaining 500
    ts::return_shared(estate);

    sc.next_tx(H1);
    let a = sc.take_from_sender<Coin<SUI>>();
    let b = sc.take_from_sender<Coin<SUI>>();
    assert!(coin::value(&a) + coin::value(&b) == 700, 0); // 70% of 1000
    coin::burn_for_testing(a);
    coin::burn_for_testing(b);
    sc.next_tx(H2);
    let c = sc.take_from_sender<Coin<SUI>>();
    let d = sc.take_from_sender<Coin<SUI>>();
    assert!(coin::value(&c) + coin::value(&d) == 300, 1); // 30% of 1000
    coin::burn_for_testing(c);
    coin::burn_for_testing(d);
    clock::destroy_for_testing(clk);
    sc.end();
}

#[test, expected_failure(abort_code = EVesting)]
fun test_distribute_coin_rejects_vesting() {
    let mut sc = ts::begin(OWNER);
    let mut clk = clock::create_for_testing(sc.ctx());
    create_estate(vector[H1], vector[10000], option::none(), 100, 50, &clk, sc.ctx());
    sc.next_tx(OWNER);
    let mut estate = sc.take_shared<Estate>();
    set_vesting(&mut estate, 0, 1000, &clk, sc.ctx());
    deposit_coin<SUI>(&mut estate, coin::mint_for_testing<SUI>(1000, sc.ctx()), &clk, sc.ctx());
    trigger_now(&mut estate, &mut clk);
    distribute_coin<SUI>(&mut estate, sc.ctx()); // aborts EVesting (must use vested path)
    ts::return_shared(estate);
    clock::destroy_for_testing(clk);
    sc.end();
}

#[test, expected_failure(abort_code = EBadVesting)]
fun test_set_vesting_bad_params() {
    let mut sc = ts::begin(OWNER);
    let mut clk = clock::create_for_testing(sc.ctx());
    create_estate(vector[H1], vector[10000], option::none(), 100, 50, &clk, sc.ctx());
    sc.next_tx(OWNER);
    let mut estate = sc.take_shared<Estate>();
    set_vesting(&mut estate, 2000, 1000, &clk, sc.ctx()); // cliff > duration -> abort
    ts::return_shared(estate);
    clock::destroy_for_testing(clk);
    sc.end();
}

#[test]
fun test_recovery_rotates_owner() {
    let mut sc = ts::begin(OWNER);
    let mut clk = clock::create_for_testing(sc.ctx());
    create_estate(vector[H1], vector[10000], option::none(), 100, 50, &clk, sc.ctx());
    sc.next_tx(OWNER);
    let mut estate = sc.take_shared<Estate>();
    set_guardians(&mut estate, vector[H1, H2, H3], 2, &clk, sc.ctx());
    ts::return_shared(estate);

    sc.next_tx(H1);
    let mut estate = sc.take_shared<Estate>();
    propose_recovery(&mut estate, @0xF1, sc.ctx()); // 1 of 2
    assert!(estate.owner == OWNER, 0); // not yet rotated
    ts::return_shared(estate);

    sc.next_tx(H2);
    let mut estate = sc.take_shared<Estate>();
    approve_recovery(&mut estate, sc.ctx()); // 2 of 2 -> rotate
    assert!(estate.owner == @0xF1, 1);
    ts::return_shared(estate);

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test, expected_failure(abort_code = ENotGuardian)]
fun test_recovery_non_guardian_rejected() {
    let mut sc = ts::begin(OWNER);
    let mut clk = clock::create_for_testing(sc.ctx());
    create_estate(vector[H1], vector[10000], option::none(), 100, 50, &clk, sc.ctx());
    sc.next_tx(OWNER);
    let mut estate = sc.take_shared<Estate>();
    set_guardians(&mut estate, vector[H1, H2], 2, &clk, sc.ctx());
    ts::return_shared(estate);

    sc.next_tx(@0xBAD);
    let mut estate = sc.take_shared<Estate>();
    propose_recovery(&mut estate, @0xF1, sc.ctx()); // not a guardian -> abort
    ts::return_shared(estate);
    clock::destroy_for_testing(clk);
    sc.end();
}

#[test, expected_failure(abort_code = EBadThreshold)]
fun test_set_guardians_bad_threshold() {
    let mut sc = ts::begin(OWNER);
    let mut clk = clock::create_for_testing(sc.ctx());
    create_estate(vector[H1], vector[10000], option::none(), 100, 50, &clk, sc.ctx());
    sc.next_tx(OWNER);
    let mut estate = sc.take_shared<Estate>();
    set_guardians(&mut estate, vector[H1], 2, &clk, sc.ctx()); // threshold > guardians -> abort
    ts::return_shared(estate);
    clock::destroy_for_testing(clk);
    sc.end();
}

#[test, expected_failure(abort_code = ENoRecovery)]
fun test_cancel_recovery_blocks_approval() {
    let mut sc = ts::begin(OWNER);
    let mut clk = clock::create_for_testing(sc.ctx());
    create_estate(vector[H1], vector[10000], option::none(), 100, 50, &clk, sc.ctx());
    sc.next_tx(OWNER);
    let mut estate = sc.take_shared<Estate>();
    set_guardians(&mut estate, vector[H1, H2], 2, &clk, sc.ctx());
    ts::return_shared(estate);

    sc.next_tx(H1);
    let mut estate = sc.take_shared<Estate>();
    propose_recovery(&mut estate, @0xF1, sc.ctx()); // 1 of 2
    ts::return_shared(estate);

    sc.next_tx(OWNER);
    let mut estate = sc.take_shared<Estate>();
    cancel_recovery(&mut estate, sc.ctx()); // owner veto
    ts::return_shared(estate);

    sc.next_tx(H2);
    let mut estate = sc.take_shared<Estate>();
    approve_recovery(&mut estate, sc.ctx()); // nothing pending -> abort ENoRecovery
    ts::return_shared(estate);
    clock::destroy_for_testing(clk);
    sc.end();
}

#[test, expected_failure(abort_code = EAlreadyApproved)]
fun test_double_approve_rejected() {
    let mut sc = ts::begin(OWNER);
    let mut clk = clock::create_for_testing(sc.ctx());
    create_estate(vector[H1], vector[10000], option::none(), 100, 50, &clk, sc.ctx());
    sc.next_tx(OWNER);
    let mut estate = sc.take_shared<Estate>();
    set_guardians(&mut estate, vector[H1, H2, H3], 3, &clk, sc.ctx()); // threshold 3, no auto-exec
    ts::return_shared(estate);

    sc.next_tx(H1);
    let mut estate = sc.take_shared<Estate>();
    propose_recovery(&mut estate, @0xF1, sc.ctx()); // H1 approves (1 of 3)
    approve_recovery(&mut estate, sc.ctx()); // H1 again -> abort EAlreadyApproved
    ts::return_shared(estate);
    clock::destroy_for_testing(clk);
    sc.end();
}
