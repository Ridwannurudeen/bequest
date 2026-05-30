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
   - allowed Move targets: only Bequest estate claim/distribution calls that the UI uses
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
ENOKI_ALLOWED_MOVE_TARGETS=0xPACKAGE::estate::distribute_coin
```

Keep `ENOKI_PRIVATE_API_KEY` server-only. Never import it into a client component.

`NEXT_PUBLIC_BEQUEST_CLAIM_TARGET` is optional. If unset, Lane B uses the deployed
`0xPACKAGE::estate::distribute_coin<0x2::sui::SUI>` path as the first gasless claim proof. This is
not a new contract dependency: after an estate is `TRIGGERED`, the heir can sponsor a transaction
that distributes the SUI balance to all named heirs. If Lane A later ships a dedicated
`estate::claim` entrypoint, set `NEXT_PUBLIC_BEQUEST_CLAIM_TARGET` and update the Enoki allowlist.

## Backend routes added

- `POST /api/enoki/nonce`
- `POST /api/enoki/zkp`
- `POST /api/enoki/address`
- `POST /api/enoki/sponsor`
- `POST /api/enoki/execute`
- `POST /api/claim/transaction-kind`

These routes are intentionally thin wrappers around Enoki. They validate request shape, keep the
private key server-side, and centralize allowlists. The claim transaction-kind route is not an
Enoki call; it builds the Sui transaction-kind bytes that `/api/enoki/sponsor` expects.

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
2. Use the default `estate::distribute_coin<0x2::sui::SUI>` target, or set
   `NEXT_PUBLIC_BEQUEST_CLAIM_TARGET` if Lane A ships a dedicated claim function.
3. Call `/api/claim/transaction-kind` with the triggered estate object id.
4. Call `/api/enoki/sponsor`.
5. Sign returned bytes through the Enoki/zkLogin account.
6. Call `/api/enoki/execute`.
7. Verify the claim transaction lands on Sui testnet and the heir paid no gas.
8. Pin the digest on `/claim/demo` so the receipt shows estate, identity binding, sponsor, and tx.

Verdict format:

```
Verdict: pass/fail
Heir starting SUI balance: ...
Claim tx digest: ...
Gas sponsor: Enoki
Failure mode if sponsorship is disabled: ...
```
