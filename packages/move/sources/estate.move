// Copyright (c) 2026 Bequest
// SPDX-License-Identifier: Apache-2.0

/// Spike #5 — trustless custody / escrow.
///
/// Proves the corrected custody model: assets are escrowed INTO a shared `Estate`
/// (NOT left in the owner's address — there is no owner signature at trigger time,
/// because the owner is gone). While ACTIVE, only the owner can deposit or withdraw —
/// this is the proof-of-life and keeps the owner in full control. After the trigger
/// flips the estate to TRIGGERED, the named heir — not the owner — claims the assets,
/// authorized purely by on-chain state. No custodian, no owner key at claim time.
///
/// Heterogeneous assets:
///   - any `Coin<T>` is merged into a per-type `Balance<T>` held in a dynamic field;
///   - any `key + store` object (NFTs, LP positions, …) is held in an `ObjectBag`.
///
/// Framework signatures verified 2026-05-22 against sui-framework `framework/testnet`.
module bequest::estate;

use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin};
use sui::dynamic_field as df;
use sui::object_bag::{Self, ObjectBag};

const ENotOwner: u64 = 1;
const ENotHeir: u64 = 2;
const ENotTriggered: u64 = 3;
const ENotActive: u64 = 4;

const STATUS_ACTIVE: u8 = 0;
const STATUS_TRIGGERED: u8 = 1;

public struct Estate has key {
    id: UID,
    owner: address,
    heir: address,
    status: u8,
    objects: ObjectBag,
}

/// Dynamic-field key for the escrowed `Balance<T>` of each coin type.
public struct CoinKey<phantom T> has copy, drop, store {}

/// Create and share an Estate (ACTIVE) naming a single heir. Returns its ID.
public fun create_estate(heir: address, ctx: &mut TxContext): ID {
    let estate = Estate {
        id: object::new(ctx),
        owner: ctx.sender(),
        heir,
        status: STATUS_ACTIVE,
        objects: object_bag::new(ctx),
    };
    let eid = object::id(&estate);
    transfer::share_object(estate);
    eid
}

entry fun create_estate_entry(heir: address, ctx: &mut TxContext) {
    let _ = create_estate(heir, ctx);
}

/// Owner deposits a coin of any type while ACTIVE; merges into the per-type balance.
public fun deposit_coin<T>(estate: &mut Estate, c: Coin<T>, ctx: &TxContext) {
    assert!(estate.owner == ctx.sender(), ENotOwner);
    assert!(estate.status == STATUS_ACTIVE, ENotActive);
    let key = CoinKey<T> {};
    if (df::exists(&estate.id, key)) {
        let bal: &mut Balance<T> = df::borrow_mut(&mut estate.id, key);
        balance::join(bal, coin::into_balance(c));
    } else {
        df::add(&mut estate.id, key, coin::into_balance(c));
    };
}

/// Owner deposits any `key + store` object while ACTIVE.
public fun deposit_object<T: key + store>(estate: &mut Estate, obj: T, ctx: &TxContext) {
    assert!(estate.owner == ctx.sender(), ENotOwner);
    assert!(estate.status == STATUS_ACTIVE, ENotActive);
    let key = object::id(&obj);
    object_bag::add(&mut estate.objects, key, obj);
}

/// Owner reclaims a coin while ACTIVE (proof-of-life; retains full control).
public fun withdraw_coin<T>(estate: &mut Estate, amount: u64, ctx: &mut TxContext): Coin<T> {
    assert!(estate.owner == ctx.sender(), ENotOwner);
    assert!(estate.status == STATUS_ACTIVE, ENotActive);
    let bal: &mut Balance<T> = df::borrow_mut(&mut estate.id, CoinKey<T> {});
    coin::take(bal, amount, ctx)
}

/// Flip to TRIGGERED. Spike: owner triggers to simulate the dead-man's switch;
/// in production this transition is owned by the inactivity keeper / executor override.
public fun trigger(estate: &mut Estate, ctx: &TxContext) {
    assert!(estate.owner == ctx.sender(), ENotOwner);
    estate.status = STATUS_TRIGGERED;
}

/// Heir claims the full escrowed balance of type T after TRIGGERED.
/// Authorized purely by on-chain state — the owner's key is never involved.
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

#[test_only]
use sui::test_scenario as ts;
#[test_only]
use sui::sui::SUI;

#[test_only]
public struct Nft has key, store { id: UID }

#[test]
fun test_custody_lifecycle() {
    let owner = @0xA;
    let heir = @0xB;
    let mut sc = ts::begin(owner);
    create_estate_entry(heir, sc.ctx());

    // While ACTIVE: owner deposits 1000 SUI + an NFT, then withdraws 200 (proof of life).
    sc.next_tx(owner);
    let mut estate = sc.take_shared<Estate>();
    deposit_coin<SUI>(&mut estate, coin::mint_for_testing<SUI>(1000, sc.ctx()), sc.ctx());
    let nft = Nft { id: object::new(sc.ctx()) };
    let nft_id = object::id(&nft);
    deposit_object(&mut estate, nft, sc.ctx());
    let refund = withdraw_coin<SUI>(&mut estate, 200, sc.ctx());
    assert!(coin::value(&refund) == 200, 0);
    coin::burn_for_testing(refund);
    ts::return_shared(estate);

    // Owner triggers the estate.
    sc.next_tx(owner);
    let mut estate = sc.take_shared<Estate>();
    trigger(&mut estate, sc.ctx());
    ts::return_shared(estate);

    // Heir claims the remaining 800 SUI + the NFT — no owner signature involved.
    sc.next_tx(heir);
    let mut estate = sc.take_shared<Estate>();
    let inheritance = claim_coin<SUI>(&mut estate, sc.ctx());
    assert!(coin::value(&inheritance) == 800, 1);
    coin::burn_for_testing(inheritance);
    let nft: Nft = claim_object(&mut estate, nft_id, sc.ctx());
    let Nft { id } = nft;
    object::delete(id);
    ts::return_shared(estate);

    sc.end();
}

#[test, expected_failure(abort_code = ENotTriggered)]
fun test_heir_cannot_claim_while_active() {
    let owner = @0xA;
    let heir = @0xB;
    let mut sc = ts::begin(owner);
    create_estate_entry(heir, sc.ctx());
    sc.next_tx(owner);
    let mut estate = sc.take_shared<Estate>();
    deposit_coin<SUI>(&mut estate, coin::mint_for_testing<SUI>(1000, sc.ctx()), sc.ctx());
    ts::return_shared(estate);

    sc.next_tx(heir);
    let mut estate = sc.take_shared<Estate>();
    let c = claim_coin<SUI>(&mut estate, sc.ctx()); // aborts: ENotTriggered
    coin::burn_for_testing(c);
    ts::return_shared(estate);
    sc.end();
}

#[test, expected_failure(abort_code = ENotActive)]
fun test_owner_cannot_withdraw_after_trigger() {
    let owner = @0xA;
    let mut sc = ts::begin(owner);
    create_estate_entry(@0xB, sc.ctx());
    sc.next_tx(owner);
    let mut estate = sc.take_shared<Estate>();
    deposit_coin<SUI>(&mut estate, coin::mint_for_testing<SUI>(1000, sc.ctx()), sc.ctx());
    trigger(&mut estate, sc.ctx());
    let c = withdraw_coin<SUI>(&mut estate, 100, sc.ctx()); // aborts: ENotActive
    coin::burn_for_testing(c);
    ts::return_shared(estate);
    sc.end();
}
