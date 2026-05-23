# Bequest last-wishes (Seal + Walrus)

The encrypted last-letter feature, end to end:

1. Create an `Estate` (sole heir = signer, timers = 0 for the demo).
2. **Seal**-encrypt the letter to the estate's key-id namespace (`[estate id][nonce]`).
3. Store the ciphertext on **Walrus** (public testnet publisher).
4. Decrypt while `ACTIVE` → **denied** (`estate::seal_approve` aborts).
5. `arm` + `finalize` → `TRIGGERED`.
6. Fetch the ciphertext back from Walrus + decrypt → **succeeds**, letter recovered.

The letter is cryptographically unreadable until the inheritance trigger fires on-chain.

## Setup
`.env` (git-ignored):
```
NETWORK=testnet
PACKAGE_ID=0x<bequest package id>
SUI_SECRET_KEY=suiprivkey1<account key>
# optional overrides (defaults are the public Walrus testnet endpoints):
WALRUS_PUBLISHER=https://publisher.walrus-testnet.walrus.space
WALRUS_AGGREGATOR=https://aggregator.walrus-testnet.walrus.space
```
```
npm install
npm run typecheck
npm run wishes
```

## Notes
- **Storage** uses the Walrus HTTP publisher/aggregator (the official client HTTP API). The public
  testnet publisher subsidises storage, so no WAL token is required. For production, run your own
  publisher or use the `@mysten/walrus` SDK with an upload relay (the direct-to-storage-nodes SDK
  path is unreliable from restricted networks — "too many failures writing to nodes").
- **Seal** uses the two Mysten independent testnet key servers (threshold 2). The gating policy is
  `estate::seal_approve(id, estate)`: key released only when the id is in the estate's namespace and
  `status == TRIGGERED`.
- Decryption is heir-side (the heir's `SessionKey` signs a personal message); only addresses that
  satisfy the policy can recover the key.
