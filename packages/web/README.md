# Bequest web

Lane B product/frontend app for Bequest.

The app currently runs against `lib/bequest-sdk.ts`, a typed mock of the frozen Lane A/Lane B SDK
contract. Replace `bequestSdkMock` with the real SDK adapter once the testnet package and Enoki
configuration are ready.

The public claim receipt surface lives at `/claim/demo`. It is intentionally honest: it shows the
current testnet package and Enoki readiness boundary, but does not claim a sponsored tx exists until
the Enoki keys and Lane A heir-claim Move target are configured.

## Run

```
npm install
npm run dev
```

## Verify

```
npm run check
```

## Scope

- Owner setup narrative
- Heir claim narrative
- Executor dashboard narrative
- SVG favicon/logo/OG image
- Launch metadata for app previews
- Enoki backend route scaffolding for nonce, ZKP, address lookup, sponsorship, and execution
- Public claim receipt page for the eventual gasless heir claim proof

Not included yet:

- Real Enoki zkLogin
- Sponsored transaction wiring
- A confirmed heir-claim Move entrypoint

## Enoki prep

Copy `.env.example` to `.env.local`, then fill the public and server-only Enoki keys.

The server routes live under `/api/enoki/*`. Keep `ENOKI_PRIVATE_API_KEY` server-side only.
See `../../docs/spikes/enoki-integration-plan.md` for the exact spike acceptance criteria.

Once Lane A confirms the target, set:

```
NEXT_PUBLIC_BEQUEST_CLAIM_TARGET=0xPACKAGE::estate::claim
ENOKI_ALLOWED_MOVE_TARGETS=0xPACKAGE::estate::claim
```
