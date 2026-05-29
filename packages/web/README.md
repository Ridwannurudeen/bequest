# Bequest web

Lane B product/frontend app for Bequest.

The app currently runs against `lib/bequest-sdk.ts`, a typed mock of the frozen Lane A/Lane B SDK
contract. Replace `bequestSdkMock` with the real SDK adapter once the testnet package and Enoki
configuration are ready.

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

Not included yet:

- Real Enoki zkLogin
- Sponsored transaction wiring
- Testnet estate reads/writes

## Enoki prep

Copy `.env.example` to `.env.local`, then fill the public and server-only Enoki keys.

The server routes live under `/api/enoki/*`. Keep `ENOKI_PRIVATE_API_KEY` server-side only.
See `../../docs/spikes/enoki-integration-plan.md` for the exact spike acceptance criteria.
