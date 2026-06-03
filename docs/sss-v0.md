# Sui Succession Standard (SSS) v0

- **Status:** Draft (v0)
- **Track:** Sui Overflow 2026, DeFi & Payments
- **Reference implementation:** Bequest (`estate.move`), Sui testnet package `0x696ea071464b9836ea018c12fea0b4475099fa269a94b8c92d7672887dcfb885`
- **Scope:** a minimal interface for on-chain succession and recovery objects on Sui, so wallets, custodians, indexers, keepers, and dApps can read, trigger, and settle any compliant policy without bespoke integration.

## Abstract

A *succession policy* is an on-chain object that holds assets on behalf of an owner and releases
them to named beneficiaries when a trigger condition is met (the owner goes inactive, a date
passes, an oracle reports an event, or guardians approve). Today every team that builds this
re-invents the state machine, the events, and the read shape, so no shared tooling can exist. SSS
v0 standardizes four things: the **canonical states**, the **canonical events**, the **object read
shape**, and a **pluggable trigger interface**, plus how encrypted last-wishes **bind to status via
Seal**. Any object that conforms can be observed and settled by the same SDK, keeper, and wallet.

## Motivation

Succession, inheritance, dead-man's switches, and account recovery are the same primitive with
different trigger conditions. Naming it as one standard lets:

- **Wallets and custodians** render and act on any compliant policy with one integration.
- **Keepers and indexers** watch one event set and drive settlement for every implementation.
- **dApp builders** compose succession into vaults, payroll, and treasuries without forking a Move package.
- **Seal key servers** enforce one decryption predicate ("only after triggered") across implementations.

This is the EVM-ecosystem lesson (shared token and account standards unlocked shared tooling)
applied to the succession category on Sui.

## Terminology

- **Policy:** the on-chain object (e.g. Bequest's `Estate`) holding assets and succession rules.
- **Owner:** the principal who creates and funds the policy and can reset it while active.
- **Beneficiary:** an address (or zkLogin-derived address) entitled to a share on trigger.
- **Executor:** an optional party that can pause or cancel a pending trigger.
- **Trigger module:** the pluggable predicate that decides whether a policy may move to triggered.
- **Keeper:** any permissionless caller that pokes the time- or condition-gated transitions.

## Specification

### 1. Canonical states

A compliant policy MUST expose a `status: u8` with these values:

| Value | Name | Meaning |
|---|---|---|
| `0` | `ACTIVE` | Owner in control. Deposits, withdrawals, and heartbeats allowed. No claim possible. |
| `1` | `PENDING` | Trigger condition met; grace window running. Owner heartbeat or executor pause returns to `ACTIVE`. |
| `2` | `TRIGGERED` | Grace elapsed. Beneficiaries may claim; Seal decryption is unlocked. Terminal. |

`CLAIMED` is not a separate status; it is derived from claim events and remaining balance, so a
partially-claimed policy stays `TRIGGERED`.

### 2. Object read shape

A compliant policy MUST be a shared object exposing at least:

```
status:        u8                       // 0 | 1 | 2
owner:         address
beneficiaries: vector<{ recipient: address, bps: u64 }>   // bps sum == 10000; last takes remainder
timing:        { inactivity_ms: u64, grace_ms: u64, last_activity_ms: u64 }
executor:      Option<address>
trigger_kind:  u8                       // see section 4
wishes:        Option<{ walrus_blob_id: vector<u8>, seal_key_id: vector<u8> }>
```

`bps` (basis points) MUST sum to 10000. Implementations MUST route any integer-division remainder
to the last beneficiary so no dust is stranded.

### 3. Canonical events

A compliant implementation MUST emit:

| Event | Emitted when | Fields |
|---|---|---|
| `PolicyCreated` | a policy is created | `policy_id`, `owner`, `trigger_kind`, `timing` |
| `Armed` | `ACTIVE -> PENDING` | `policy_id`, `armed_at_ms`, `eligible_at_ms` |
| `Triggered` | `PENDING -> TRIGGERED` | `policy_id`, `triggered_at_ms` |
| `Reset` | `PENDING -> ACTIVE` (owner activity or executor pause) | `policy_id`, `reason: u8` (0 owner activity, 1 executor pause) |
| `Claimed` | a beneficiary receives a share | `policy_id`, `recipient`, `amount`, `asset_type` |

These five events are sufficient for a keeper to drive a policy end to end and for an indexer to
reconstruct full lifecycle and payout history with no contract-specific knowledge.

### 4. Pluggable trigger modules

The condition that moves a policy `ACTIVE -> PENDING` is abstracted so different succession kinds
share one state machine. A trigger module is a Move module exposing:

```
public fun is_triggerable<Evidence>(
    policy: &PolicyView,   // status, timing, trigger params
    clock: &Clock,
    evidence: &Evidence,   // module-specific (empty for time-based)
): bool
```

`trigger_kind` identifies the module:

| `trigger_kind` | Module | `is_triggerable` is true when |
|---|---|---|
| `0` | **Inactivity** (dead-man's switch) | `now - last_activity_ms >= inactivity_ms`. No evidence. The Bequest default. |
| `1` | **Scheduled** | `now >= release_at_ms`. No evidence. |
| `2` | **Oracle** | a referenced oracle reports the named condition. Evidence = oracle proof. |
| `3` | **Guardian** | M-of-N guardians have approved. Evidence = guardian approvals. |

`arm()` is permissionless but MUST verify `is_triggerable` for the policy's `trigger_kind`.
`finalize()` (`PENDING -> TRIGGERED`) is permissionless and MUST verify `now >= eligible_at_ms`
(armed-at plus grace). Permissionless calls let any keeper advance a policy while the contract
binds every transition to verifiable on-chain conditions, never to the caller.

### 5. Seal binding (encrypted last-wishes)

If a policy carries `wishes`, the implementation MUST gate Seal decryption on status:

```
public fun seal_approve(key_id: vector<u8>, policy: &Policy, ...) {
    assert!(status(policy) == 2 /* TRIGGERED */, ENotTriggered);
    assert!(key_id_in_namespace(key_id, policy));  // namespace = [pkg id][object id][nonce]
}
```

The key-id MUST live in the policy's namespace `[package id][object id][nonce]` so a Seal key
server releases the decryption key only after the policy is `TRIGGERED`. Decryption is bound to
on-chain status, not to a key shared in advance.

### 6. Claim semantics

After `TRIGGERED`, `claim` MUST be authorizable from on-chain state alone (no owner signature) and
MUST route each share to the recorded beneficiary, regardless of who submits the transaction.
Implementations SHOULD support claiming in a single PTB and MAY support a sponsored (gasless)
claim so non-crypto beneficiaries can receive assets via zkLogin sign-in.

## SDK integration path

Tooling consumes SSS through one typed surface (the Bequest `@bequest/sdk` is the reference):

```
createPolicy(config) -> policyId
deposit(policyId, assets[])
setBeneficiaries(policyId, [{ recipient, bps }])
heartbeat(policyId)                 // Reset to ACTIVE
arm(policyId, evidence?)            // ACTIVE -> PENDING, verifies trigger module
finalize(policyId)                  // PENDING -> TRIGGERED after grace
executorOverride(policyId, action)  // pause | cancel
claim(policyId)                     // post-trigger, gasless-capable
readPolicy(policyId) -> PolicyView  // the section-2 read shape
uploadWishes(policyId, blob)        // -> Walrus blob id, Seal policy bound to status
decryptWishes(policyId)             // resolves only after TRIGGERED
```

An indexer subscribes to the five canonical events; a keeper polls `readPolicy` plus `Armed`
timing and submits `arm` / `finalize`; a wallet renders any policy from the read shape. None of
these need implementation-specific code.

## Conformance

An implementation is **SSS v0 compliant** if it:

1. exposes `status: u8` using the section-1 values on a shared object;
2. exposes the section-2 read shape (or a superset);
3. emits the five section-3 events with at least the named fields;
4. binds `ACTIVE -> PENDING` to a `trigger_kind` module per section 4, with permissionless,
   condition-gated `arm` and `finalize`;
5. if it carries wishes, gates Seal decryption on `TRIGGERED` per section 5;
6. authorizes `claim` from on-chain state and routes shares to recorded beneficiaries.

## Reference implementation

Bequest implements SSS v0 with `trigger_kind = 0` (Inactivity). `estate.move` is the policy, the
state machine, and the Seal binding (`estate::seal_approve`); the earlier `gate.move` Seal-policy
spike is archived to `docs/spikes/gate.move`. Full lifecycle (create, deposit, arm, finalize,
distribute) plus Seal-gated wishes and atomic multi-heir distribution are proven on Sui testnet at
`0x696ea071464b9836ea018c12fea0b4475099fa269a94b8c92d7672887dcfb885`. See
[`docs/architecture.md`](architecture.md).

**Conformance status.** The reference impl emits all five canonical events: `EstateCreated` (the
`PolicyCreated` name), `Armed`, `Triggered`, `Reset { reason: u8 }`, and `Claimed { recipient,
amount }` (its SUI distribution leaves the asset type implicit). With the `EstateCreated -> PolicyCreated`
alias it is fully SSS-v0 conformant on states, events, Seal binding, and claim semantics. `Heir.bps`
is typed `u64` on chain, with values bounded to 0..10000.

## Security considerations

- **Time source.** Inactivity and Scheduled modules MUST use the on-chain `Clock`, never a
  caller-supplied timestamp.
- **Permissionless transitions are safe** only because every transition re-checks its condition on
  chain; a malicious keeper cannot trigger early or redirect funds, it can only advance a policy
  whose condition already holds.
- **Reset griefing.** Frequent owner heartbeats reset the timer by design; implementations SHOULD
  bound executor powers to `pause`/`cancel` and never to redirecting beneficiaries.
- **Seal trust.** Decryption inherits Seal's threshold key-server trust model; SSS only constrains
  *when* the key is released (status `TRIGGERED`), not the cryptography.

## Open questions (v1)

- Partial and streamed distribution, and re-arming after a partial claim.
- Cross-package beneficiary composability (a policy as a beneficiary of another policy).
- Standard revocation and beneficiary-update events.
- A registry so wallets can discover compliant policies by owner without scanning all events.

## Changelog

- **v0 (2026-06):** initial draft. States, events, read shape, pluggable trigger modules, Seal
  binding, SDK path, conformance. Reference implementation: Bequest (Inactivity trigger).
