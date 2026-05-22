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
  - Next: install Sui CLI (suiup / `choco install sui`), `sui move test`, publish to testnet, run #4.
- **B:** _(fill in)_ — dolepee invited (write); brief = BEQUEST-BRIEF-B in Music.
- **Blockers:** Sui CLI not installed on A's machine — needed to compile/test/publish Move.
