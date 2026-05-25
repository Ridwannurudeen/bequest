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

Not included yet:

- Real Enoki zkLogin
- Sponsored transaction wiring
- Testnet estate reads/writes
