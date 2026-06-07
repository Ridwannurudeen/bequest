# Bequest V3 — Differentiated Vision & Build Plan (DRAFT for team review)

> Status: **DRAFT — not locked.** Opened as a PR to get @dolepee's input before we commit. See "Decisions to lock" + "Questions for Lane B" at the bottom.
> Researched 2026-06-07 (market + competitor + Sui-capability sources cited).

## Why we're rethinking
The basic "dead-man's-switch + heir claim" is now crowded with copycats, and an internal audit said the current build can't win as-is. The fix isn't more polish — it's a **category reframe + depth competitors can't fast-follow.**

## Market (real, underserved)
- ~70.4M US / 420M+ global crypto owners; **most have no estate plan.**
- ~$140B of crypto already lost to death, ~$10B/yr ongoing.
- Sources: Ledger Academy, Chainalysis (via Ledger), financefeeds, morganlegalny.

## Competitors share 3 structural flaws (our wedge)
Succession (sccn.io), Sarcophagus (EVM/Arweave), Vault12, Ledger Recover, MPC wallets:
1. **They release a seed phrase / secret** → all-or-nothing, stealable, subpoena-able. **We transfer assets by contract logic — never expose a key.**
2. **Dead money** — assets sit idle. **Ours earns yield until claimed.**
3. **One-shot, crypto-native, single-purpose** — no ongoing management, no self-recovery, brutal for non-crypto heirs, not a platform.

## The thesis
**Bequest = the continuity layer for self-custody, not a will.** Keep your wealth productive while alive, recover you if you're locked out, and hand your whole on-chain life to your people on your terms — gentle enough for someone who's never touched crypto — as a **standard any Sui wallet can switch on.**

## Wow differentiators (only-on-Sui, hard to copy)
1. **Productive estates** — escrow auto-earns yield (liquid staking → Scallop/suiUSDe). DeFi&Payments bullseye + $500K liquidity-incentive eligible.
2. **Nautilus-verified triggers + verifiable AI** — TEE attestation of death/incapacity + an AI executor with on-chain-proven integrity (Nautilus is live on mainnet; composes with Seal+Walrus).
3. **Humane AI concierge** — plain-English setup; guides a non-crypto heir through receiving (the 50%-weighted real-world soul).
4. **Assets-not-secrets** safety.
5. **No-seed-phrase heirs** — named by Google (zkLogin) or SuiNS, claiming gaslessly (Enoki).
6. **One engine** — inheritance + **self-recovery** (guardian quorum) + scheduled + DAO/treasury.
7. **The Sui Succession Standard** — open SDK + standard wallets embed.

## Use-case catalog
- **Must-have:** multi-asset inheritance · self-recovery of your own account · manageable estate (update heirs/ratios/executor/timers; withdraw anything incl. objects).
- **High-value:** productive/yield estates · programmable distribution (vesting, age-gates, allowances-from-yield, charitable remainder) · digital-legacy vault (Seal+Walrus) · Nautilus trigger + AI.
- **Future/B2B:** DAO/treasury succession · business multisig continuity · recurring payments-on-condition · cross-chain · insurance partners.

## Build plan — parallel workstreams (team)
- **WS0 Foundation (now):** audit floor + contract overhaul — estate mutability, `withdraw_object`, heir-bound `seal_approve`, multi-asset claim, zkLogin/SuiNS heir identity. *(Lane A Move + Lane B UI)*
- **WS1 Productive estates (DeFi flagship):** yield integration (liquid staking first → Scallop/suiUSDe). *(Lane A)*
- **WS2 Verifiable trigger + AI concierge:** Nautilus TEE attestation + AI heir/owner guide. *(Lane A + AI eng)*
- **WS3 Smart-trust + multi-trigger:** vesting/allowances/age-gates + guardian-quorum self-recovery + scheduled. *(Lane A Move + Lane B UI)*
- **WS4 Standard + SDK + first wallet integration.** *(Lane A/B + BD)*
- **WS5 Trust & traction:** audit, 2+ decentralized keepers + alerting, "augments probate" legal positioning, real testers. *(Lane A + owner)*

### June-21 hackathon milestone (carved out of the above)
Foundation + **WS1 productive-estate flagship** + a thin **WS2 slice** (AI heir guide in the claim flow) + 3 real testers + a real-person demo video. A *funded, growing, gaslessly-claimable* estate with an AI-guided non-crypto heir + a Seal letter beats every competitor listed above.

## Open unknowns to prototype before betting big
- Move mechanics for holding a **yield position inside the Estate** (LST receipt vs lending deposit).
- **Nautilus** enclave effort/cost for the attestation + AI path.
- **SuiNS** → address resolution for heir naming.

---

## Decisions to lock (need team sign-off)
1. **Horizon:** ship the June-21 milestone as the gate, *or* treat June-21 as a checkpoint inside the venture build?
2. **Flagship for the hackathon:** productive estates (recommended) — agree?
3. **Scope cut:** which "high-value" items make the June-21 cut vs defer?

## Questions for @dolepee (Lane B)
- Is the **AI concierge** (owner NL-setup + heir guide) something you want to own/spike for the demo, or keep it minimal?
- For **heir identity**, do you prefer zkLogin/email-derived addresses, SuiNS, or both in the owner-setup UI?
- Capacity check: with WS0 (UI for mutability/withdraw/multi-asset claim) + WS1 UI in parallel, what's realistically shippable by June 21 on the frontend?
- Anything here you think is over-reach or mis-prioritized? Push back.
