// Copyright (c) 2026 Bequest
// SPDX-License-Identifier: Apache-2.0

/// Spike #4 — Seal conditional decryption (the make-or-break primitive).
///
/// A `Gate` is a shared object that starts `ACTIVE` and can flip to `TRIGGERED`.
/// The `seal_approve` policy releases the Seal decryption key ONLY when:
///   1. the requested key-id falls in this gate's namespace  ([pkg id][gate id][nonce]), and
///   2. the gate's status == TRIGGERED.
///
/// This is the minimal, on-chain proof of Bequest's headline feature:
/// "the deceased's encrypted last-wishes decrypt for the heir only AFTER the
/// inheritance trigger fires." In production this same shape becomes the
/// `Estate`'s Seal policy; here the owner flips the status to simulate the trigger.
///
/// Access-control pattern adapted from MystenLabs/seal `move/patterns/sources/whitelist.move`.
module bequest::gate;

const ENoAccess: u64 = 1;
const ENotOwner: u64 = 2;

const STATUS_ACTIVE: u8 = 0;
const STATUS_TRIGGERED: u8 = 1;

public struct Gate has key {
    id: UID,
    owner: address,
    status: u8,
}

/// Create and share a Gate in the ACTIVE state. Returns its ID.
public fun create_gate(ctx: &mut TxContext): ID {
    let gate = Gate {
        id: object::new(ctx),
        owner: ctx.sender(),
        status: STATUS_ACTIVE,
    };
    let gid = object::id(&gate);
    transfer::share_object(gate);
    gid
}

/// Convenience entry: create + share a Gate. The id is read from the tx's object changes.
entry fun create_gate_entry(ctx: &mut TxContext) {
    let _ = create_gate(ctx);
}

/// Flip the gate to TRIGGERED. In real Bequest this transition is gated by the
/// inactivity keeper / executor; for the spike the owner flips it to simulate the trigger.
public fun trigger(gate: &mut Gate, ctx: &TxContext) {
    assert!(gate.owner == ctx.sender(), ENotOwner);
    gate.status = STATUS_TRIGGERED;
}

public fun status(gate: &Gate): u8 {
    gate.status
}

/// Seal access policy. Key-id format: [pkg id][gate id][nonce].
/// Seal key servers call this read-only via dry-run; it must abort if access is denied.
entry fun seal_approve(id: vector<u8>, gate: &Gate) {
    assert!(is_prefix(gate.id.to_bytes(), id), ENoAccess);
    assert!(gate.status == STATUS_TRIGGERED, ENoAccess);
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

#[test_only]
use sui::test_scenario as ts;

#[test]
fun test_status_flip() {
    let owner = @0xA;
    let mut sc = ts::begin(owner);
    create_gate_entry(sc.ctx());

    sc.next_tx(owner);
    let mut gate = sc.take_shared<Gate>();
    assert!(gate.status() == STATUS_ACTIVE, 0);
    gate.trigger(sc.ctx());
    assert!(gate.status() == STATUS_TRIGGERED, 1);
    ts::return_shared(gate);

    sc.end();
}
