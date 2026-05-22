// Copyright (c) 2026 Bequest
// SPDX-License-Identifier: Apache-2.0

/// Spike #5 (custody/escrow) + Spike #2 (dead-man's switch), combined into the real `Estate`.
///
/// Custody: assets are escrowed INTO a shared `Estate` (there is no owner signature at trigger
/// time, because the owner is gone). `Coin<T>` is merged into a per-type `Balance<T>` in a dynamic
/// field; arbitrary `key+store` objects go in an `ObjectBag`.
///
/// Dead-man's switch (Sui Clock):
///   ACTIVE --(no activity for `inactivity_ms`)--> PENDING --(grace `grace_ms` elapses)--> TRIGGERED
///   - Any owner activity (heartbeat / deposit / withdraw) resets the timer back to ACTIVE
///     (false-positive protection: owner on vacation just needs to check in).
///   - A named executor can pause a PENDING trigger (second line of false-positive defence).
///   - `arm` / `finalize` are permissionless (a keeper calls them); they only succeed once the
///     Clock has actually passed the deadlines, so the keeper cannot trigger early.
/// While ACTIVE/PENDING only the owner can move assets; after TRIGGERED only the heir can claim.
///
/// Framework signatures verified 2026-05-22 against sui-framework `framework/testnet`.
module bequest::estate;

use sui::balance::{Self, Balance};
use sui::clock::{Self, Clock};
use sui::coin::{Self, Coin};
use sui::dynamic_field as df;
use sui::object_bag::{Self, ObjectBag};

const ENotOwner: u64 = 1;
const ENotHeir: u64 = 2;
const ENotTriggered: u64 = 3;
const EAlreadyTriggered: u64 = 4;
const ENotActive: u64 = 5;
const ENotPending: u64 = 6;
const ETooEarly: u64 = 7;
const ENotExecutor: u64 = 8;

const STATUS_ACTIVE: u8 = 0;
const STATUS_PENDING: u8 = 1;
const STATUS_TRIGGERED: u8 = 2;

public struct Estate has key {
    id: UID,
    owner: address,
    heir: address,
    executor: Option<address>,
    status: u8,
    inactivity_ms: u64,
    grace_ms: u64,
    last_active_ms: u64,
    pending_since_ms: u64,
    objects: ObjectBag,
}

/// Dynamic-field key for the escrowed `Balance<T>` of each coin type.
public struct CoinKey<phantom T> has copy, drop, store {}

/// Create and share an Estate (ACTIVE), naming an heir, an optional executor, and the timers.
public fun create_estate(
    heir: address,
    executor: Option<address>,
    inactivity_ms: u64,
    grace_ms: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): ID {
    let estate = Estate {
        id: object::new(ctx),
        owner: ctx.sender(),
        heir,
        executor,
        status: STATUS_ACTIVE,
        inactivity_ms,
        grace_ms,
        last_active_ms: clock::timestamp_ms(clock),
        pending_since_ms: 0,
        objects: object_bag::new(ctx),
    };
    let eid = object::id(&estate);
    transfer::share_object(estate);
    eid
}

/// Proof-of-life: reset the timer and clear any pending trigger. Owner is clearly alive.
fun touch(estate: &mut Estate, clock: &Clock) {
    estate.last_active_ms = clock::timestamp_ms(clock);
    estate.status = STATUS_ACTIVE;
    estate.pending_since_ms = 0;
}

/// Owner heartbeat — explicit proof-of-life.
public fun heartbeat(estate: &mut Estate, clock: &Clock, ctx: &TxContext) {
    assert!(estate.owner == ctx.sender(), ENotOwner);
    touch(estate, clock);
}

/// Owner deposits a coin of any type (also counts as proof-of-life).
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

/// Owner deposits any `key + store` object (also counts as proof-of-life).
public fun deposit_object<T: key + store>(
    estate: &mut Estate,
    obj: T,
    clock: &Clock,
    ctx: &TxContext,
) {
    assert!(estate.owner == ctx.sender(), ENotOwner);
    assert!(estate.status != STATUS_TRIGGERED, EAlreadyTriggered);
    let key = object::id(&obj);
    object_bag::add(&mut estate.objects, key, obj);
    touch(estate, clock);
}

/// Owner reclaims a coin (also counts as proof-of-life).
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
}

/// Permissionless: PENDING -> TRIGGERED once `grace_ms` has elapsed since arming.
public fun finalize(estate: &mut Estate, clock: &Clock) {
    assert!(estate.status == STATUS_PENDING, ENotPending);
    assert!(clock::timestamp_ms(clock) >= estate.pending_since_ms + estate.grace_ms, ETooEarly);
    estate.status = STATUS_TRIGGERED;
}

/// Owner cancels a pending trigger (proof-of-life).
public fun cancel_pending(estate: &mut Estate, clock: &Clock, ctx: &TxContext) {
    assert!(estate.owner == ctx.sender(), ENotOwner);
    assert!(estate.status == STATUS_PENDING, ENotPending);
    touch(estate, clock);
}

/// Named executor pauses a pending trigger (false-positive defence).
public fun executor_pause(estate: &mut Estate, clock: &Clock, ctx: &TxContext) {
    let sender = ctx.sender();
    assert!(estate.executor.contains(&sender), ENotExecutor);
    assert!(estate.status == STATUS_PENDING, ENotPending);
    touch(estate, clock);
}

/// Heir claims the full escrowed balance of type T after TRIGGERED. No owner key involved.
public fun claim_coin<T>(estate: &mut Estate, ctx: &mut TxContext): Coin<T> {
    assert!(estate.status == STATUS_TRIGGERED, ENotTriggered);
    assert!(estate.heir == ctx.sender(), ENotHeir);
    let bal: Balance<T> = df::remove(&mut estate.id, CoinKey<T> {});
    coin::from_balance(bal, ctx)
}

/// Heir claims a specific escrowed object after TRIGGERED.
public fun claim_object<T: key + store>(estate: &mut Estate, id: ID, ctx: &TxContext): T {
    assert!(estate.status == STATUS_TRIGGERED, ENotTriggered);
    assert!(estate.heir == ctx.sender(), ENotHeir);
    object_bag::remove(&mut estate.objects, id)
}

public fun status(estate: &Estate): u8 {
    estate.status
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
const HEIR: address = @0xB;
#[test_only]
const EXECUTOR: address = @0xC;

#[test]
fun test_deadman_lifecycle() {
    let mut sc = ts::begin(OWNER);
    let mut clk = clock::create_for_testing(sc.ctx());
    // inactivity 100ms, grace 50ms, no executor.
    create_estate(HEIR, option::none(), 100, 50, &clk, sc.ctx());

    sc.next_tx(OWNER);
    let mut estate = sc.take_shared<Estate>();
    deposit_coin<SUI>(&mut estate, coin::mint_for_testing<SUI>(1000, sc.ctx()), &clk, sc.ctx());
    let nft = Nft { id: object::new(sc.ctx()) };
    let nft_id = object::id(&nft);
    deposit_object(&mut estate, nft, &clk, sc.ctx());

    clock::increment_for_testing(&mut clk, 100); // reach the inactivity deadline
    arm(&mut estate, &clk);
    assert!(estate.status() == STATUS_PENDING, 0);
    clock::increment_for_testing(&mut clk, 50); // reach the grace deadline
    finalize(&mut estate, &clk);
    assert!(estate.status() == STATUS_TRIGGERED, 1);
    ts::return_shared(estate);

    sc.next_tx(HEIR);
    let mut estate = sc.take_shared<Estate>();
    let inheritance = claim_coin<SUI>(&mut estate, sc.ctx());
    assert!(coin::value(&inheritance) == 1000, 2);
    coin::burn_for_testing(inheritance);
    let nft: Nft = claim_object(&mut estate, nft_id, sc.ctx());
    let Nft { id } = nft;
    object::delete(id);
    ts::return_shared(estate);

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test]
fun test_executor_pause_resets() {
    let mut sc = ts::begin(OWNER);
    let mut clk = clock::create_for_testing(sc.ctx());
    create_estate(HEIR, option::some(EXECUTOR), 100, 50, &clk, sc.ctx());

    sc.next_tx(OWNER);
    let mut estate = sc.take_shared<Estate>();
    deposit_coin<SUI>(&mut estate, coin::mint_for_testing<SUI>(1000, sc.ctx()), &clk, sc.ctx());
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
    create_estate(HEIR, option::none(), 100, 50, &clk, sc.ctx());

    sc.next_tx(OWNER);
    let mut estate = sc.take_shared<Estate>();
    clock::increment_for_testing(&mut clk, 90);
    heartbeat(&mut estate, &clk, sc.ctx()); // proof-of-life resets last_active to 90
    clock::increment_for_testing(&mut clk, 90); // now = 180; deadline is 90 + 100 = 190
    arm(&mut estate, &clk); // aborts ETooEarly (180 < 190)
    ts::return_shared(estate);
    clock::destroy_for_testing(clk);
    sc.end();
}

#[test, expected_failure(abort_code = ETooEarly)]
fun test_cannot_arm_before_inactivity() {
    let mut sc = ts::begin(OWNER);
    let mut clk = clock::create_for_testing(sc.ctx());
    create_estate(HEIR, option::none(), 100, 50, &clk, sc.ctx());
    sc.next_tx(OWNER);
    let mut estate = sc.take_shared<Estate>();
    clock::increment_for_testing(&mut clk, 50);
    arm(&mut estate, &clk); // aborts ETooEarly (50 < 100)
    ts::return_shared(estate);
    clock::destroy_for_testing(clk);
    sc.end();
}

#[test, expected_failure(abort_code = ETooEarly)]
fun test_cannot_finalize_before_grace() {
    let mut sc = ts::begin(OWNER);
    let mut clk = clock::create_for_testing(sc.ctx());
    create_estate(HEIR, option::none(), 100, 50, &clk, sc.ctx());
    sc.next_tx(OWNER);
    let mut estate = sc.take_shared<Estate>();
    clock::increment_for_testing(&mut clk, 100);
    arm(&mut estate, &clk);
    clock::increment_for_testing(&mut clk, 10); // only 10ms into the 50ms grace
    finalize(&mut estate, &clk); // aborts ETooEarly
    ts::return_shared(estate);
    clock::destroy_for_testing(clk);
    sc.end();
}

#[test, expected_failure(abort_code = ENotTriggered)]
fun test_heir_cannot_claim_while_active() {
    let mut sc = ts::begin(OWNER);
    let mut clk = clock::create_for_testing(sc.ctx());
    create_estate(HEIR, option::none(), 100, 50, &clk, sc.ctx());
    sc.next_tx(OWNER);
    let mut estate = sc.take_shared<Estate>();
    deposit_coin<SUI>(&mut estate, coin::mint_for_testing<SUI>(1000, sc.ctx()), &clk, sc.ctx());
    ts::return_shared(estate);

    sc.next_tx(HEIR);
    let mut estate = sc.take_shared<Estate>();
    let c = claim_coin<SUI>(&mut estate, sc.ctx()); // aborts: ENotTriggered
    coin::burn_for_testing(c);
    ts::return_shared(estate);
    clock::destroy_for_testing(clk);
    sc.end();
}

#[test, expected_failure(abort_code = EAlreadyTriggered)]
fun test_owner_cannot_withdraw_after_trigger() {
    let mut sc = ts::begin(OWNER);
    let mut clk = clock::create_for_testing(sc.ctx());
    create_estate(HEIR, option::none(), 100, 50, &clk, sc.ctx());
    sc.next_tx(OWNER);
    let mut estate = sc.take_shared<Estate>();
    deposit_coin<SUI>(&mut estate, coin::mint_for_testing<SUI>(1000, sc.ctx()), &clk, sc.ctx());
    clock::increment_for_testing(&mut clk, 100);
    arm(&mut estate, &clk);
    clock::increment_for_testing(&mut clk, 50);
    finalize(&mut estate, &clk);
    let c = withdraw_coin<SUI>(&mut estate, 100, &clk, sc.ctx()); // aborts: EAlreadyTriggered
    coin::burn_for_testing(c);
    ts::return_shared(estate);
    clock::destroy_for_testing(clk);
    sc.end();
}
