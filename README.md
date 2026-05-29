# Bequest

**On-chain inheritance for crypto assets, built on Sui.** An owner sets inheritance rules and
escrows assets into an `Estate`. If they go inactive (dead-man's switch), the assets distribute
atomically to named heirs via a PTB. Heirs claim by signing in with Google (zkLogin) — gasless,
no seed phrase, no crypto knowledge. Encrypted last-wishes live on Walrus and decrypt via Seal
only after the inheritance trigger fires.

> Sui Overflow 2026 — primary track: **DeFi & Payments**. Plan: `../../Music/Sui-Overflow-2026/BEQUEST-ROADMAP.md`.

## Status
Phase 0 (de-risk). First spike scaffolded: **#4 Seal conditional decryption** — the make-or-break
primitive. Run it to prove the headline feature before building.

## Repo layout
```
bequest/
├── packages/
│   ├── web/                  # Lane B product frontend (Next.js, mocked SDK contract)
│   ├── move/                 # Move package `bequest`
│   │   ├── Move.toml         #   edition 2024.beta, Sui framework/testnet
│   │   └── sources/gate.move #   Gate + status-gated seal_approve (spike #4)
│   └── seal-spike/           # TS spike for #4 (encrypt → deny while ACTIVE → trigger → decrypt)
│       ├── src/spike.ts
│       └── README.md         #   full setup + run instructions
```

## Lane B frontend
The first product surface lives in `packages/web`. It is intentionally mocked against the frozen
`bequest-sdk` signatures so the owner setup, heir claim, and executor dashboard can progress before
Lane A's testnet SDK is fully wired.

```
cd packages/web
npm install
npm run check
```

The current UI is not the final Enoki integration. It is the product skeleton and launch surface:
clear flows, metadata, SVG logo/favicon, OG image, and a typed mock SDK replacement point.
Enoki integration prep lives in `docs/spikes/enoki-integration-plan.md`.

## The interface (frozen by May 24 — the contract between Lane A and Lane B)
Lane B builds the entire frontend against this typed `bequest-sdk`. Once frozen, signatures are
a contract; bump the version if a spike forces a change.

```
createEstate(config) -> estateId
deposit(estateId, assets[])
setHeirs(estateId, heirs[])        // heir = { binding, ratioBps }
heartbeat(estateId)
armTrigger(estateId, params)       // inactivityMs, gracePeriodMs, executor?
claim(estateId)                    // gasless heir claim, post-trigger
executorOverride(estateId, action) // pause | cancel
readEstate(estateId) -> EstateView
uploadWishes(estateId, blob)       // -> Walrus blobId, Seal policy bound to estate
decryptWishes(estateId)            // only resolves after status == Triggered
```

## Architecture decisions (locked)
- **Custody:** assets are escrowed into the shared `Estate` object (NOT left in the owner's
  address — there is no owner signature at trigger time). Owner can withdraw/cancel anytime while
  `Active`. After trigger, `claim` is authorized purely from on-chain state.
- **State machine:** `Active → Pending (grace + warnings) → Triggered → Claimed`. Any
  deposit/withdraw or `heartbeat()` resets to `Active`; executor can `pause`/`cancel` `Pending`.
- **Seal policy:** `seal_approve(id, gate/estate)` releases the key only when status is
  `Triggered` and the key-id is in the object's namespace `[pkg id][object id][nonce]`.

## Run the first spike
See `packages/seal-spike/README.md`. Short version (needs the Sui CLI installed + a funded
testnet address):
```powershell
cd packages/move && sui move build && sui move test && sui client publish --gas-budget 200000000
cd ../seal-spike && npm install && npm run spike
```

## Verified toolchain (2026-05-22)
`@mysten/seal@1.1.3`, `@mysten/sui@2.17.0` (peer `^2.16.2`), Seal mainnet-live with Move
`seal_approve` time-locked/conditional policies. Move: edition `2024.beta`, `rev = framework/testnet`.
