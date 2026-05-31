# Bequest web

Lane B product/frontend app for Bequest.

The app currently runs against `lib/bequest-sdk.ts`, a typed mock of the frozen Lane A/Lane B SDK
contract. Replace `bequestSdkMock` with the real SDK adapter once the testnet package and Enoki
configuration are ready.

The public claim receipt surface lives at `/claim/demo`. It is intentionally honest: it shows the
current testnet package, the default claim target, and the Enoki readiness boundary, but does not
claim a sponsored tx exists until the Enoki keys are configured and a live sponsored digest lands.

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

## Scope

- Owner setup narrative
- Heir claim narrative
- Executor dashboard narrative
- SVG favicon/logo/OG image
- Launch metadata for app previews
- Enoki backend route scaffolding for nonce, ZKP, address lookup, sponsorship, and execution
- Claim transaction-kind builder for the default Enoki-sponsored distribution call
- Public claim receipt page for the eventual gasless heir claim proof
- Default sponsored claim target: `estate::distribute_coin<0x2::sui::SUI>`

Not included yet:

- Real Enoki zkLogin
- Sponsored transaction wiring
- A live Enoki-sponsored claim/distribution digest

## Enoki prep

Copy `.env.example` to `.env.local`, then fill the public and server-only Enoki keys.

The server routes live under `/api/enoki/*`. Keep `ENOKI_PRIVATE_API_KEY` server-side only.
See `../../docs/spikes/enoki-integration-plan.md` for the exact spike acceptance criteria.

The claim bytes route lives at `/api/claim/transaction-kind`. It accepts `{ "estateId": "0x..." }`
and returns `transactionBlockKindBytes` for the configured claim target. Pipe those bytes into
`/api/enoki/sponsor` once Enoki keys are configured.

`npm run verify:claim-kind` does the same proof without running the web server: it finds a live
`EstateCreated` object for the current package and builds sponsor-ready transaction-kind bytes.

By default, Lane B targets the deployed SUI distribution call:

```
ENOKI_ALLOWED_MOVE_TARGETS=0xPACKAGE::estate::distribute_coin
```

If Lane A later adds a dedicated heir claim entrypoint, override the public target too:

```
NEXT_PUBLIC_BEQUEST_CLAIM_TARGET=0xPACKAGE::estate::claim
ENOKI_ALLOWED_MOVE_TARGETS=0xPACKAGE::estate::claim
```
