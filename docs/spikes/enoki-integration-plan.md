# Enoki integration plan

Owner: Lane B (Product & Frontend)

This is the implementation checklist for the two Lane B proof gates:

- #1 zkLogin heir binding
- #6 Enoki sponsored claim

## Source of truth

- Enoki HTTP API base URL: `https://api.enoki.mystenlabs.com/v1`
- Sponsorship requires a backend route with a private Enoki API key.
- The frontend should build `transactionBlockKindBytes` with `onlyTransactionKind: true`, send those
  bytes to our backend, sign the returned sponsored transaction bytes, then call the execute route.

## Required Enoki portal setup

1. Create the Bequest app in the Enoki Developer Portal.
2. Add Google as an auth provider.
3. Create a public API key enabled for zkLogin on Sui testnet.
4. Create a private API key enabled for sponsored transactions on Sui testnet.
5. Configure sponsored transaction allowlists:
   - allowed addresses: Bequest package, estate objects, Sui clock if needed
   - allowed Move targets: only Bequest estate claim/setup calls that the UI uses
6. Add local and deployed origins:
   - `http://localhost:3000`
   - production preview URL when known

## Environment contract

Copy `packages/web/.env.example` to `packages/web/.env.local`.

Required for real integration:

```
NEXT_PUBLIC_SUI_NETWORK=testnet
NEXT_PUBLIC_BEQUEST_PACKAGE_ID=0x...
NEXT_PUBLIC_ENOKI_PUBLIC_API_KEY=...
ENOKI_PRIVATE_API_KEY=...
ENOKI_ALLOWED_MOVE_TARGETS=0xPACKAGE::estate::claim
```

Keep `ENOKI_PRIVATE_API_KEY` server-only. Never import it into a client component.

## Backend routes added

- `POST /api/enoki/nonce`
- `POST /api/enoki/zkp`
- `POST /api/enoki/address`
- `POST /api/enoki/sponsor`
- `POST /api/enoki/execute`

These routes are intentionally thin wrappers around Enoki. They validate request shape, keep the
private key server-side, and centralize allowlists.

## Spike #1 acceptance

To mark zkLogin heir binding as proven:

1. Sign in with Google through Enoki.
2. Call `/api/enoki/address` with the zkLogin JWT.
3. Record the returned Sui address and salt.
4. Confirm the owner flow can store a heir binding before the heir signs in.
5. Confirm the later Google sign-in resolves to the same Sui address.

Verdict format:

```
Verdict: pass/fail
Google provider: configured/not configured
Heir address stable across sessions: yes/no
Attack note: what happens if the Google account is compromised?
```

## Spike #6 acceptance

To mark sponsored claim as proven:

1. Use a clean heir account with no SUI.
2. Build a claim transaction kind in the frontend.
3. Call `/api/enoki/sponsor`.
4. Sign returned bytes through the Enoki/zkLogin account.
5. Call `/api/enoki/execute`.
6. Verify the claim transaction lands on Sui testnet and the heir paid no gas.

Verdict format:

```
Verdict: pass/fail
Heir starting SUI balance: ...
Claim tx digest: ...
Gas sponsor: Enoki
Failure mode if sponsorship is disabled: ...
```
