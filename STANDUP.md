# Standup log

Daily 15-min async. Format: yesterday / today / blockers. Weekly Sunday gate review.

---

## Week 0 — De-risk (May 22 → May 28)

**Gate (May 28):** all 7 spikes green or scoped-down · `bequest-sdk` interface frozen (May 24)
· testnet deploy pipeline works.

Spike owners — A: #2 dead-man's-switch, #3 PTB gas, #4 Seal conditional decrypt, #5 custody/escrow.
B: #1 zkLogin heir-binding, #6 Enoki sponsored-tx, #7 competition + legal scan.

### 2026-05-22
- **A:** Repo scaffolded + pushed PRIVATE (github.com/Ridwannurudeen/bequest).
  - Spike #4 (Seal conditional decrypt): `gate.move` (status-gated `seal_approve`, verified vs
    Seal whitelist pattern) + `seal-spike/spike.ts` (typechecks green vs @mysten/seal@1.1.3).
  - Spike #5 (custody/escrow): `estate.move` — escrow into shared `Estate` (Coin<T> via dynamic
    field + objects via ObjectBag), owner withdraw while ACTIVE, heir claim after TRIGGERED with
    no owner key. 1 lifecycle test + 2 expected-failure tests. Framework sigs verified vs
    framework/testnet. NOT yet compiled — needs `sui move test`.
  - **Move tests 4/4 GREEN** on sui 1.72.2. Framework-clone failure (flaky net) solved by
    pre-seeding the `~/.move` cache — see `packages/move/README.md`. Move.toml kept clean/portable.
    Fixed `df::exists_`→`df::exists`.
  - **DEPLOYED to testnet** — package id (prepend 0x): `09cc2da78fb91b933a7660a65e8506255f711502e3369abc9f1050c157fb2e4c`
    (publish digest `9RMMNHL1CejdpeBA68mReopQu9nRBRKo2R3bBmTuP9Zw`).
  - **Live spike #4 PASSED** vs real Seal testnet key servers: decrypt DENIED while ACTIVE →
    flip TRIGGERED → decrypt SUCCEEDED + plaintext recovered. Seal conditional decryption PROVEN.
  - **Spike #2 (dead-man's switch) DONE** — `estate.move` now has the Clock-based state machine
    ACTIVE→PENDING→TRIGGERED: `arm`/`finalize` (permissionless keeper, time-gated), heartbeat +
    deposit/withdraw reset the timer, `executor_pause` cancels a pending trigger. **8/8 Move tests
    pass** (incl. heartbeat-defers-trigger, executor-pause, can't-arm-early, can't-finalize-early).
    Note: deposit/withdraw/heartbeat/create now take `&Clock` — SDK interface to reflect this.
  - **Spike #3 (PTB gas ceiling) DONE** — verified testnet protocol limits (1024 cmds/PTB, 2048
    object transfers/tx, ~50k SUI gas ceiling) → a full estate fits one atomic PTB by orders of
    magnitude. Built multi-heir model: `create_estate(heir_addrs, heir_bps, …)` (bps sum=10000),
    ratio `distribute_coin<T>` (last heir gets remainder, u128 overflow-guarded), per-object
    assignment + `distribute_object(s)<T>`. Scale test: 5 heirs + 100 NFTs distributed cleanly.
    **All A de-risk spikes (#2/#3/#4/#5) now GREEN.** Move suite 8/8.
  - **Keeper service DONE + estate redeployed.** New testnet package id (prepend 0x):
    `e5916dd8d64d2fcd938a10abfe4cee7746a22b16e830c82191c73d251aa871cc` (modules estate+gate; now
    emits EstateCreated/Armed/Triggered). `packages/keeper` (TS) discovers estates via events, reads
    timers, drives `arm`/`finalize`. **Live test PASSED**: seed → armed (ACTIVE→PENDING) →
    finalized (→TRIGGERED) → idempotent no-op. Run `npm run keeper` or `npm run keeper:watch`.
  - **Last-wishes (Seal + Walrus) DONE.** Added `estate::seal_approve` (status-gated), redeployed —
    new package id (prepend 0x): `696ea071464b9836ea018c12fea0b4475099fa269a94b8c92d7672887dcfb885`.
    `packages/wishes`: Seal-encrypt letter → store on Walrus (HTTP publisher) → decrypt DENIED while
    ACTIVE → arm+finalize → fetch from Walrus + decrypt SUCCEEDS. **Live testnet run PASSED.**
    (Walrus SDK direct-write was flaky from this network — switched to the official publisher/
    aggregator HTTP API; public testnet publisher subsidises storage, no WAL needed.)
  - **All Sui-stack primitives integrated + proven on testnet: object model, PTBs, Clock, Seal, Walrus.**
  - **Distribution live DONE.** `packages/keeper/src/distribute.ts`: create 2-heir estate (70/30) →
    deposit 0.1 SUI → **arm+finalize+distribute_coin in ONE atomic PTB** → verified heir1=70%, heir2=30%
    on-chain. **Full lifecycle proven live: create → deposit → trigger → distribute.**
  - **Lane A backend COMPLETE + proven on testnet.** Next: hand to B for zkLogin/Enoki claim flow + frontend.
- **B:** _(fill in)_ — dolepee invited (write); brief = BEQUEST-BRIEF-B in Music.
- **Blockers:** none.
