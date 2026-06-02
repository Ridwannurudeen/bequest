# Bequest

**On-chain inheritance for crypto assets, built on Sui.** An owner sets inheritance rules and
escrows assets into an `Estate`. If they go inactive (dead-man's switch), the assets distribute
atomically to named heirs via a PTB. Heirs claim by signing in with Google (zkLogin) — gasless,
no seed phrase, no crypto knowledge. Encrypted last-wishes live on Walrus and decrypt via Seal
only after the inheritance trigger fires.

> Sui Overflow 2026 — primary track: **DeFi & Payments**. Plan: `../../Music/Sui-Overflow-2026/BEQUEST-ROADMAP.md`.

## Status
Live testnet proof surface in progress.

- Move package published on Sui testnet with `estate` and `gate` modules.
- Core estate lifecycle proven: custody, dead-man trigger, Seal-gated wishes, and atomic coin
  distribution.
- The web app reads a live on-chain estate on the homepage (newest via `EstateCreated` events),
  falling back to a demo when none exists, plus a public `/claim/demo` receipt.
- CI (`.github/workflows/ci.yml`) typechecks/builds the web + keeper packages and runs
  `sui move test` on every push and PR.
- Keeper package includes a no-secret verifier (`npm run verify:proof`) for judges.
- Remaining dependency: Enoki credentials and a live sponsored transaction. Lane B can use the
  existing `estate::distribute_coin<0x2::sui::SUI>` path first; a later dedicated Lane A `claim`
  entrypoint can override it if needed.

## Repo layout
```
bequest/
├── packages/
│   ├── move/                 # Sui Move package: Estate custody + dead-man switch + Seal policy
│   ├── web/                  # Lane B frontend, proof surface, Enoki route scaffolding
│   ├── keeper/               # Event-driven keeper + live package verifier
│   ├── wishes/               # Seal + Walrus last-wishes proof
│   └── seal-spike/           # Earlier focused Seal conditional-decryption spike
├── docs/spikes/              # Enoki, legal, product-flow, and Lane B planning notes
└── STANDUP.md                # Build log and deployed-package history
```

## Lane B frontend
The first product surface lives in `packages/web`. The read path is wired to the live testnet
package (the homepage reads a real `Estate`); the remaining write methods stay mocked against the
frozen `bequest-sdk` signatures until the signing layer lands, so owner setup, heir claim, and the
executor dashboard can keep progressing.

```
cd packages/web
npm install
npm run check
```

The current UI is not the final Enoki integration. It is the product skeleton and launch surface:
clear flows, metadata, SVG logo/favicon, OG image, and a typed mock SDK replacement point.
Enoki integration prep lives in `docs/spikes/enoki-integration-plan.md`.

## Live testnet proof
The current Sui testnet package is published at
`0x696ea071464b9836ea018c12fea0b4475099fa269a94b8c92d7672887dcfb885`. Judges can verify the
package surface without private keys:

```
cd packages/keeper
npm install
npm run verify:proof
```

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

## Core checks

```
cd packages/move && sui move test
cd ../web && npm install && npm run check
cd ../keeper && npm install && npm run typecheck && npm run verify:proof
```

## Verified toolchain (2026-05-22)
`@mysten/seal@1.1.3`, `@mysten/sui@2.17.0` (peer `^2.16.2`), Seal mainnet-live with Move
`seal_approve` time-locked/conditional policies. Move: edition `2024.beta`, `rev = framework/testnet`.

## Why inheritance on Sui
The thesis behind Bequest, and why this category belongs on Sui specifically:
[`docs/why-inheritance.md`](docs/why-inheritance.md).
