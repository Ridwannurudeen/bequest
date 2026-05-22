# Spike #4 — Seal conditional decryption

**Question this answers:** can an encrypted blob be made to decrypt *only after* an on-chain
status flips to `TRIGGERED`? This is Bequest's headline feature ("last-wishes decrypt for the
heir only after the inheritance trigger"). If this works, the riskiest assumption is dead.

**Verdict gate:** the script must print `✅ SPIKE PASSED` — decrypt DENIED while `ACTIVE`,
SUCCEEDS after `TRIGGERED`, plaintext recovered intact.

## What it does
1. Publishes nothing — you publish the Move package once (below), it reuses it.
2. Creates a `Gate` shared object (`ACTIVE`).
3. Encrypts a secret to key-id `[pkg id][gate id][nonce]` (Seal, threshold 2).
4. Tries to decrypt while `ACTIVE` → expects failure (the `seal_approve` policy aborts).
5. Flips the gate to `TRIGGERED`.
6. Decrypts again → expects success and verifies the plaintext.

## Prerequisites (one-time)
The Sui CLI is **not** installed on this machine yet. Install it, then publish the package.

```powershell
# 1. Install the Sui CLI (pick one — verified 2026-05-22):
#    - suiup (official, recommended; also installs walrus/seal/mvr):
#        https://github.com/MystenLabs/suiup   (Windows: binaries land in %LOCALAPPDATA%\bin — add to PATH)
#    - Chocolatey:  choco install sui
#    - or a prebuilt binary: https://github.com/MystenLabs/sui/releases
#    Docs: https://docs.sui.io/guides/developer/getting-started/sui-install
sui --version

# 2. Point at testnet + create/select an address, then fund it:
sui client new-env --alias testnet --rpc https://fullnode.testnet.sui.io:443
sui client switch --env testnet
sui client active-address
#    Fund it: https://faucet.sui.io  (or `sui client faucet`)

# 3. Build + publish the Move package:
cd ../move
sui move build
sui move test                       # runs test_status_flip
sui client publish --gas-budget 200000000
#    Copy the published PACKAGE ID (the "Published Objects" package id — this is version 1).

# 4. Export the active address' secret key (bech32 suiprivkey1...):
sui keytool export --key-identity $(sui client active-address)
```

## Configure
Create `packages/seal-spike/.env` (this file is git-ignored — never commit it):

```
NETWORK=testnet
PACKAGE_ID=0x<your published package id>
SUI_SECRET_KEY=suiprivkey1<your exported key>
```

## Run
```powershell
npm install
npm run typecheck      # optional: type-checks the spike
npm run spike
```

Expected tail of output:
```
3. Attempting decrypt while ACTIVE (expect DENIED)…
   ✓ correctly DENIED while ACTIVE (...)
4. Gate flipped to TRIGGERED
5. Attempting decrypt after TRIGGERED (expect SUCCESS)…
   ✓ SUCCEEDED after TRIGGERED. Recovered: "My dearest Maya — ..."

✅ SPIKE PASSED — Seal decrypts only after the on-chain trigger.
```

## Notes / gotchas (verified)
- Uses the two **Mysten independent testnet** key servers (Open mode, free, no API key).
- `verifyKeyServers: false` for speed; a fresh `SealClient` is used per decrypt to avoid the
  in-memory key cache giving a false positive.
- After `TRIGGERED`, the key servers' full nodes may lag a few seconds on the new object
  version — the script retries with backoff.
- Seal requires the **first-version** package id; never use an upgraded package id.
- `SessionKey` TTL is 10 min; rerun if it expires mid-debug.
