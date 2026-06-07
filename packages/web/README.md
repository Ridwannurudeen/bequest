# Bequest web

Lane B product/frontend app for Bequest.

The app runs the real Enoki zkLogin and sponsored-execution flow against the live Sui testnet
package. The homepage reads a live on-chain `Estate`; owner setup, heir claim, and the last-wishes
decrypt all sign with the owner/heir zkLogin keypair and execute through the Enoki sponsor routes.
The flows are gated on the Enoki credentials at runtime, so without them the components degrade
gracefully and CI still typechecks and builds.

The public claim receipt surface lives at `/claim/demo` and at `/claim/<estateId>` for a live
estate. It pins the testnet package, the distribution target, the sponsor boundary, and the live
sponsored claim digest (`NEXT_PUBLIC_BEQUEST_SPONSORED_CLAIM_DIGEST`).

## Run

```
npm install
npm run dev
```

## Verify

```
npm run check
npm run verify:claim-kind
```

## Scope (implemented)

- Owner setup: Google sign-in, name heirs and shares, set the inactivity window, create the estate
  through the Enoki-sponsored path (`components/owner-setup.tsx`).
- Heir claim: Google sign-in, sponsored `distribute_coin` execution (`components/claim-action.tsx`).
- Last-wishes: heir-side Seal threshold-decrypt, gated so the key servers release only after the
  estate is `Triggered` (`components/wishes-letter.tsx`).
- Full-portfolio read surface: the homepage, claim receipt, and estates dashboard render liquid SUI
  plus escrowed key+store objects; native `StakedSui` objects are labeled as staked SUI positions.
- Executor dashboard, live homepage estate read, public claim receipt, SVG favicon/logo/OG image.
- Enoki backend routes for nonce, ZKP, address lookup, sponsorship, and execution.
- Claim transaction-kind builder for the default sponsored distribution call.
- Default sponsored claim target: `estate::distribute_coin<0x2::sui::SUI>`.

## Live (proven on testnet)

- Real Enoki zkLogin sign-in.
- Sponsored transaction wiring: the sponsor pays gas, the heir or owner signs with their zkLogin
  keypair, and execution runs through the Enoki routes.
- A live Enoki-sponsored claim/distribution digest:
  `DV7eZduJmAzsW9vHzRSjXt8GgDWaQifp1vbXV1MBf7t5` (sponsor-paid `distribute_coin<SUI>`, the gas owner
  differs from the sender, status success), verifiable on SuiScan.
- The object/yield leg is contract-backed through `deposit_object<T>` / `distribute_objects<T>`.
  Pin a live bundle digest only after `cd ../keeper && npm run full-portfolio` succeeds with a
  funded testnet key.

## Enoki prep

Copy `.env.example` to `.env.local`, then fill the public and server-only Enoki keys plus
`NEXT_PUBLIC_GOOGLE_CLIENT_ID`. The sign-in buttons and the wishes reveal render only when these are
set. Keep `ENOKI_PRIVATE_API_KEY` server-side only. See
`../../docs/spikes/enoki-integration-plan.md` for the spike acceptance criteria.

The claim bytes route lives at `/api/claim/transaction-kind`. It accepts `{ "estateId": "0x..." }`
and returns `transactionBlockKindBytes` for the configured claim target, which `/api/enoki/sponsor`
then sponsors. `npm run verify:claim-kind` does the same proof without the web server: it finds a
live `EstateCreated` object for the current package and builds sponsor-ready transaction-kind bytes.

By default, Lane B targets the deployed SUI distribution call:

```
ENOKI_ALLOWED_MOVE_TARGETS=0xPACKAGE::estate::distribute_coin
```

If Lane A later adds a dedicated heir claim entrypoint, override the public target too:

```
NEXT_PUBLIC_BEQUEST_CLAIM_TARGET=0xPACKAGE::estate::claim
ENOKI_ALLOWED_MOVE_TARGETS=0xPACKAGE::estate::claim
```

The pinned sponsored claim digest is published via:

```
NEXT_PUBLIC_BEQUEST_SPONSORED_CLAIM_DIGEST=DV7eZduJmAzsW9vHzRSjXt8GgDWaQifp1vbXV1MBf7t5
```
