# Bequest

**Programmable conditional transfers for crypto assets, built on Sui.** An owner escrows assets
into an `Estate` and names the recipients. When a trustless on-chain condition fires, liquid SUI
and assigned key+store objects distribute atomically via a PTB. The flagship use case is
inheritance, but the primitive is broader: a non-crypto recipient can claim with Google zkLogin and
Enoki sponsorship, without the owner key and without gas. Encrypted letters live on Walrus and
decrypt via Seal only after the trigger fires.

> Sui Overflow 2026 — primary track: **DeFi & Payments**. Plan: `../../Music/Sui-Overflow-2026/BEQUEST-ROADMAP.md`.

## Architecture

The system diagram, the dead-man's-switch lifecycle, the component breakdown, the capital flow on
trigger, and the deployed package IDs are in [`docs/architecture.md`](docs/architecture.md).

## Status
Live app: <https://bequest.gudman.xyz>

Live testnet proof surface: the full gasless inheritance flow (create, heir claim, Seal last-wishes decrypt) is proven on Sui testnet.

- Move package published on Sui testnet as an estate-only package.
- Core estate lifecycle proven: custody, dead-man trigger, Seal-gated wishes, and atomic coin
  distribution.
- Full-portfolio V2 path is contract-backed without redeploy: the package exposes
  `deposit_object<T: key + store>` and `distribute_objects<T>`, and the keeper can distribute every
  escrowed coin and object type after `Triggered`.
- The web app reads a live on-chain estate on the homepage (newest via `EstateCreated` events),
  falling back to a demo when none exists, plus a public `/claim/demo` receipt.
- CI (`.github/workflows/ci.yml`) typechecks/builds the web + keeper packages and runs
  `sui move test` on every push and PR.
- Keeper package includes a no-secret verifier (`npm run verify:proof`) for judges.
- The Enoki zkLogin signing and sponsored-execution flow is live and verified in prod: gasless owner
  estate creation, a gasless heir claim (sponsored tx `DV7eZduJmAzsW9vHzRSjXt8GgDWaQifp1vbXV1MBf7t5`,
  sponsor-paid and verified on SuiScan), and heir-side Seal last-wishes decrypt in the browser, all
  from a Google sign-in with no wallet and no gas.
- Limitation: Bequest is a Sui testnet technical succession primitive, not legal, tax, or
  financial advice. The current proof demonstrates custody/distribution mechanics, not legal estate
  enforcement.

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
The product surface lives in `packages/web`. The read path is wired to the live testnet package
(the homepage reads a real `Estate`), and the write path is implemented end to end against Enoki
zkLogin: owner estate creation, heir claim, and last-wishes decrypt each sign with the owner/heir
zkLogin keypair and execute through the Enoki sponsor routes. The flows render and execute when the
Enoki credentials are configured at runtime; without them the components degrade gracefully so CI
can still typecheck and build.

```
cd packages/web
npm install
npm run check
```

- Owner setup (`components/owner-setup.tsx`): Google sign-in, name heirs and shares, set the
  inactivity window, create the estate through the Enoki-sponsored path.
- Heir claim (`components/claim-action.tsx`): Google sign-in, sponsored `distribute_coin` execution.
- Full-portfolio custody: the live reader and estate dashboard surface liquid SUI plus escrowed
  key+store objects, including native `StakedSui` positions when present.
- Last-wishes (`components/wishes-letter.tsx`): heir-side Seal threshold-decrypt, with the key
  servers releasing only after the estate is `Triggered`.

Required runtime env for the live flows: `NEXT_PUBLIC_ENOKI_PUBLIC_API_KEY`,
`NEXT_PUBLIC_GOOGLE_CLIENT_ID`, the pinned last-wishes pointer
(`NEXT_PUBLIC_BEQUEST_WISHES_BLOB_ID` and `NEXT_PUBLIC_BEQUEST_WISHES_INNER_ID`), and the
server-side Enoki sponsor key. See `.env.example`.

## Live testnet proof
The current Sui testnet package is published at
`0x5224dd7dad3ae82c3d31f9c1569f5e1f4328a5bb6acd0b5b07228ef4b35c49d1`. Judges can verify the
package surface without private keys:

```
cd packages/keeper
npm install
npm run verify:proof
```

The live package is estate-only. The earlier `gate` Seal spike is archived under
[`docs/spikes/gate.move`](docs/spikes/gate.move); the production Seal policy is
`estate::seal_approve`, and the current package carries the valid lifecycle proof.

### Submission proof table

| Proof | Status | Link / command |
| --- | --- | --- |
| Package publish | Live | [`47o4DCh8Dun4iYCkHajf849eH9yVmWQMsJfES6qNwEeB`](https://suiscan.xyz/testnet/tx/47o4DCh8Dun4iYCkHajf849eH9yVmWQMsJfES6qNwEeB) |
| Package object | Live | [`0x5224dd7dad3ae82c3d31f9c1569f5e1f4328a5bb6acd0b5b07228ef4b35c49d1`](https://suiscan.xyz/testnet/object/0x5224dd7dad3ae82c3d31f9c1569f5e1f4328a5bb6acd0b5b07228ef4b35c49d1) |
| Claim transaction-kind builder | Live | `cd packages/web && npm run verify:claim-kind` |
| Keeper/lifecycle proof verifier | Live | `cd packages/keeper && npm run verify:proof` |
| Sponsored heir claim | Live | Gasless [`DV7eZduJmAzsW9vHzRSjXt8GgDWaQifp1vbXV1MBf7t5`](https://suiscan.xyz/testnet/tx/DV7eZduJmAzsW9vHzRSjXt8GgDWaQifp1vbXV1MBf7t5): sponsor-paid `estate::distribute_coin<SUI>`, the gas owner differs from the sender so the heir paid no gas, status success. Verify via the transaction gas data on SuiScan, not an event log. |
| Full-portfolio validation | Script ready | `cd packages/keeper && npm run full-portfolio` creates a live estate, escrows liquid SUI plus a native `StakedSui` object and optional caller-owned object, triggers, distributes, and verifies final heir ownership. Requires `PACKAGE_ID` + funded `SUI_SECRET_KEY`; do not claim a live bundle digest until this command prints `BEQUEST_FULL_PORTFOLIO_PASSED` or `BEQUEST_YIELD_BUNDLE_PASSED`. |
| Seal/Walrus last-wishes policy | Proven (CLI + browser) | `LAST-WISHES PASSED` (CLI spike), plus heir-side browser decrypt verified on the triggered judge estate via `components/wishes-letter.tsx` (zkLogin `SessionKey`); the sealed letter renders only after `Triggered`. |
| Real testnet estate usage | Tooling live | `cd packages/keeper && npm run traction` counts distinct non-team owners from `EstateCreated`. |

## The interface (frozen by May 24 — the contract between Lane A and Lane B)
Lane B builds the entire frontend against this typed `bequest-sdk`. Once frozen, signatures are
a contract; bump the version if a spike forces a change.

```
createEstate(config) -> estateId
deposit(estateId, assets[])
setHeirs(estateId, heirs[])        // heir = { binding, ratioBps }
heartbeat(estateId)
armTrigger(estateId, params)       // inactivityMs, gracePeriodMs, executor?
claim(estateId)                    // sponsored heir claim path, post-trigger
executorOverride(estateId, action) // pause | cancel
readEstate(estateId) -> EstateView
uploadWishes(estateId, blob)       // -> Walrus blobId, Seal policy bound to estate
decryptWishes(estateId)            // only resolves after status == Triggered
```

Implementation boundary: the current testnet Move package backs estate creation, escrow,
heartbeat/trigger transitions, SUI and key+store object distribution, heir updates, timer/executor
updates, on-chain last-wishes anchoring, vesting, recovery, and `seal_approve`. The SDK keeps
product-facing `setHeirs` and `uploadWishes` names; the live Move entrypoints are
`update_heirs` and `set_wishes`, with browser flows wired where credentials are configured.

## Architecture decisions (locked)
- **Custody:** assets are escrowed into the shared `Estate` object (NOT left in the owner's
  address, since there is no owner signature at trigger time). The owner can withdraw and reset the
  timer while `Active`; cancellation applies in the `Pending` grace window (`cancel_pending`). After
  trigger, `claim` is authorized purely from on-chain state.
- **State machine:** `Active → Pending (grace + warnings) → Triggered → Claimed`. Any
  deposit/withdraw or `heartbeat()` resets to `Active`; executor can `pause`/`cancel` `Pending`.
- **Seal policy:** `estate::seal_approve(id, estate)` releases the key only when status is
  `Triggered`, the requester is a named heir, and the key-id is in the estate namespace
  `[estate id][nonce]`.

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
