# Standup log

Daily 15-min async. Format: yesterday / today / blockers. Weekly Sunday gate review.

---

## Week 0 — De-risk (May 22 → May 28)

**Gate (May 28):** all 7 spikes green or scoped-down · `bequest-sdk` interface frozen (May 24)
· testnet deploy pipeline works.

Spike owners — A: #2 dead-man's-switch, #3 PTB gas, #4 Seal conditional decrypt, #5 custody/escrow.
B: #1 zkLogin heir-binding, #6 Enoki sponsored-tx, #7 competition + legal scan.

### 2026-05-22
- **A:** Repo scaffolded (`bequest/`). Spike #4 (Seal conditional decrypt) written: `gate.move`
  (status-gated `seal_approve`, verified against Seal's whitelist pattern) + `seal-spike/spike.ts`
  (verified @mysten/seal@1.1.3 API). Next: install Sui CLI, publish to testnet, run the spike.
- **B:** _(fill in)_
- **Blockers:** Sui CLI not yet installed on A's machine — needed to compile/publish Move.
