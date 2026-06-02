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

const BPS_TOTAL: u64 = 10000;

const STATUS_ACTIVE: u8 = 0;
const STATUS_PENDING: u8 = 1;
const STATUS_TRIGGERED: u8 = 2;

public struct Heir has store, copy, drop {
    addr: address,
    bps: u64,
}

public struct Estate has key {
    id: UID,
    owner: address,
    heirs: vector<Heir>,
    executor: Option<address>,
    status: u8,
    inactivity_ms: u64,
    grace_ms: u64,
    last_active_ms: u64,
    pending_since_ms: u64,
    objects: ObjectBag,
    object_heir: Table<ID, address>,
}

/// Dynamic-field key for the escrowed `Balance<T>` of each coin type.
public struct CoinKey<phantom T> has copy, drop, store {}

// Events — let the off-chain keeper discover estates and observe trigger transitions.
public struct EstateCreated has copy, drop { estate: ID, owner: address }
public struct Armed has copy, drop { estate: ID }
public struct Triggered has copy, drop { estate: ID }
/// Canonical SSS events (see docs/sss-v0.md). `Reset` fires on PENDING -> ACTIVE
/// (reason 0 = owner activity, 1 = executor pause); `Claimed` fires per heir payout.
public struct Reset has copy, drop { estate: ID, reason: u8 }
public struct Claimed has copy, drop { estate: ID, recipient: address, amount: u64 }

/// Create and share an Estate (ACTIVE). `heir_addrs[i]` gets `heir_bps[i]` basis points of every
/// coin; the bps must sum to 10000. `executor` is optional.
public fun create_estate(
    heir_addrs: vector<address>,
    heir_bps: vector<u64>,
    executor: Option<address>,
    inactivity_ms: u64,
    grace_ms: u64,
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
        inactivity_ms,
        grace_ms,
        last_active_ms: clock::timestamp_ms(clock),
        pending_since_ms: 0,
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

/// Permissionless: ACTIVE -> PENDING once `inactivity_ms` has elapsed since last activity.
public fun arm(estate: &mut Estate, clock: &Clock) {
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

/// Seal access policy for the encrypted last-wishes: the key servers release the decryption key
/// ONLY when (1) the requested key-id is in this estate's namespace ([pkg id][estate id][nonce])
/// and (2) the estate has been TRIGGERED. Called read-only by Seal key servers via dry-run.
entry fun seal_approve(id: vector<u8>, estate: &Estate) {
    assert!(is_prefix(estate.id.to_bytes(), id), ENoAccess);
    assert!(estate.status == STATUS_TRIGGERED, ENoAccess);
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
    seal_approve(key, &estate); // ACTIVE -> aborts ENoAccess
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
    let mut key = estate.id.to_bytes();
    key.push_back(7u8);
    seal_approve(key, &estate); // TRIGGERED + valid namespace -> succeeds
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
    seal_approve(vector[0u8, 1u8, 2u8, 3u8], &estate);
    ts::return_shared(estate);
    clock::destroy_for_testing(clk);
    sc.end();
}
