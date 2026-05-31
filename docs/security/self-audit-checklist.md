# Bequest — Security Self-Audit Checklist

Lane A self-audit of the Move package (`packages/move/sources/estate.move`, `gate.move`) ahead of
engaging OtterSec / OpenZeppelin audit credits. Each item is grounded in the current source.
Status legend: **OK** (reviewed, no issue) · **NOTE** (intentional, documented) · **TODO**
(follow-up before mainnet/audit).

Scope: the trustless custody, dead-man trigger, distribution, and Seal-policy paths. Off-chain
keeper and frontend are out of scope here (separate review).

## 1. Access control
- [x] **OK** — Owner-only mutations assert `estate.owner == ctx.sender()`: `heartbeat`,
  `deposit_coin`, `deposit_object`, `withdraw_coin`, `cancel_pending` (`estate.move:136–205`).
- [x] **OK** — Executor pause asserts `estate.executor.contains(&sender)` and `status == PENDING`
  (`executor_pause`, `estate.move:208–213`).
- [x] **NOTE** — `arm` / `finalize` / `distribute_*` are permissionless by design (a keeper drives
  them). They are gated by status + Clock time, so no party can fire early; see §2/§6.
- [x] **NOTE** — Single executor only (`Option<address>`). Multi-sig / multiple executors is a v2
  item, not a vulnerability.

## 2. State machine integrity
- [x] **OK** — Transitions are guarded: `arm` requires `ACTIVE`, `finalize` requires `PENDING`,
  `distribute_*` and `seal_approve` require `TRIGGERED` (`estate.move:186–199, 217, 271`).
- [x] **OK** — Any owner activity resets to `ACTIVE` and clears `pending_since_ms` via `touch`
  (`estate.move:130–134`); proven by `test_heartbeat_defers_trigger`, `test_executor_pause_resets`.
- [x] **NOTE** — There is no explicit `Claimed` status; the on-chain status stays `TRIGGERED` after
  distribution. Idempotency comes from removal (see §3), not a status flip. Intentional.

## 3. Asset custody & loss
- [x] **OK** — Coins escrow into a per-type `Balance<T>` dynamic field keyed by `CoinKey<T>`;
  re-deposits `balance::join` (`estate.move:141–152`). Objects go into `ObjectBag` with a
  `Table<ID,address>` heir assignment (`deposit_object`, `estate.move:155–169`).
- [x] **OK** — `deposit_object` asserts the recipient `is_heir`, so no object can be earmarked to a
  non-heir and stranded (`estate.move:164`).
- [x] **OK** — Distribution is idempotent: `distribute_coin<T>` does `df::remove`, and
  `distribute_object(s)` do `object_bag::remove` + `table::remove`; a second call aborts on the
  missing key rather than double-spending (`estate.move:217–256`).
- [ ] **TODO** — Per-coin-type completeness: each escrowed coin type needs its own
  `distribute_coin<T>` call; an undistributed type stays escrowed after `TRIGGERED`. The keeper
  must enumerate escrowed `CoinKey<T>` types and distribute each. Document/automate before mainnet.
- [x] **OK** — `withdraw_coin` on a never-deposited type aborts cleanly on the missing dynamic field
  (no silent zero). Owner-only + not-`TRIGGERED` guarded (`estate.move:171–183`).

## 4. Arithmetic
- [x] **OK** — Heir basis points validated at creation: `n > 0`, `len(addrs) == len(bps)`, and
  `sum(bps) == 10000` (`create_estate`, `estate.move:87–98`).
- [x] **OK** — Split math casts to `u128` before multiply to avoid `u64` overflow, then back to
  `u64`; the last heir absorbs the rounding remainder so no dust is lost or created
  (`distribute_coin`, `estate.move:224–231`). Covered by `test_multiheir_coin_split`,
  `test_largescale_distribution`, `test_bad_shares_rejected`.

## 5. Seal access policy (headline feature)
- [x] **OK** — `seal_approve` denies by default: it aborts unless (1) the requested key-id has the
  estate id as a prefix (namespace binding) and (2) `status == TRIGGERED`
  (`estate.move:269–272`, mirrored in `gate.move:61–64`). Live deny→allow proven in spike #4.
- [ ] **TODO** — No inline unit test asserts `seal_approve` allow/deny (only the live spike covers
  it). Add `#[expected_failure]` tests for the `ACTIVE`-denied and wrong-namespace cases before audit.

## 6. Time / Clock
- [x] **OK** — All time math uses `sui::clock` (monotonic), not epoch or wall-clock. `arm` requires
  `now >= last_active + inactivity`; `finalize` requires `now >= pending_since + grace`
  (`estate.move:186–199`). `test_cannot_finalize_before_grace` covers the early-finalize abort.
- [x] **NOTE** — `arm` is callable by anyone the instant inactivity elapses; the grace window +
  owner-heartbeat reset + executor pause are the false-positive mitigations (per Brief A risk table).

## 7. Shared-object / concurrency / reentrancy
- [x] **OK** — `Estate` is a shared object; permissionless post-trigger distribution is the intended
  push model. No capability is transferred that would let a non-owner mutate while `ACTIVE`.
- [x] **NOTE** — Move has no mid-execution external calls, so EVM-style reentrancy does not apply.
  `public_transfer` to heirs happens after balance/object removal (effects-before-interactions holds).

## 8. Object model / capabilities
- [x] **OK** — `Estate` has `key` only (no `store`), so it cannot be wrapped/transferred away from
  its shared state (`estate.move:54`).
- [x] **OK** — `Heir` is `store, copy, drop` value data; no authority is encoded in it.

## 9. DoS / gas
- [x] **OK** — Heir loops and object distribution are bounded; spike #3 verified a full estate fits
  one PTB well under testnet limits (1024 cmds, 2048 transfers). See `docs/spikes` / STANDUP.
- [x] **NOTE** — A pathological estate with very many object types could exceed a single PTB; the
  `distribute_objects<T>` per-type batching + chunked-claim fallback is the mitigation.

## 10. Events / observability
- [x] **OK** — `EstateCreated`, `Armed`, `Triggered` are emitted for the off-chain keeper to
  discover estates and observe transitions (`estate.move:72–74, 114, 191, 199`).

## 11. Package hygiene / upgrade
- [ ] **TODO** — `gate.move` is the spike-#4 Seal proof (status flip + `seal_approve`), now
  superseded by `estate::seal_approve`. Decide whether to exclude it from the mainnet package to
  shrink the audited surface.
- [ ] **TODO** — Decide upgrade policy (immutable vs `UpgradeCap` custody) before mainnet publish;
  record in the mainnet deploy runbook.

## 12. Dependencies / toolchain
- [x] **OK** — Move edition `2024.beta`; framework + MoveStdlib resolve to the CLI-pinned rev
  (Sui 1.72.2), no git/path pins (`packages/move/Move.toml`, `README.md`).
- [x] **OK** — `@mysten/seal@1.1.3`, `@mysten/sui@2.17.0` pinned (off-chain side).

---

## Pre-audit action list (open TODOs)
1. Add inline `seal_approve` allow/deny unit tests + `distribute_object(s)` tests (§3, §5).
2. Keeper: enumerate and distribute every escrowed `CoinKey<T>` type after trigger (§3).
3. Decide `gate.move` inclusion + upgrade policy for the mainnet package (§11).
