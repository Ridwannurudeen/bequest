# Bequest keeper

The off-chain heartbeat monitor that makes the dead-man's switch autonomous. Each tick it
discovers every `Estate` (via `EstateCreated` events), reads each one's status + timers, and:

- `ACTIVE` and `now ≥ last_active + inactivity` → `arm()` (→ PENDING)
- `PENDING` and `now ≥ pending_since + grace` → `finalize()` (→ TRIGGERED)
- `TRIGGERED` → distribute every escrowed coin type and object to the heirs in one PTB

`arm`/`finalize`/`distribute_*` are permissionless and re-check state on-chain, so the keeper can
never trigger an estate before its real deadline — a buggy or malicious keeper cannot steal time —
and distribution is a safety net that delivers the inheritance even if no heir submits a claim.

## Setup
Create `packages/keeper/.env` (git-ignored — never commit it):

```
NETWORK=testnet
PACKAGE_ID=0x<bequest package id>
SUI_SECRET_KEY=suiprivkey1<keeper account key>   # any funded account; arm/finalize are permissionless
KEEPER_INTERVAL_MS=30000                          # only used by --watch
```

```
npm install
npm run typecheck
```

## Verify the live package
This check needs no private key. It reads the published package from Sui RPC and confirms the
`estate` and `gate` modules still expose the Move surface claimed by the web app.

```
npm run verify:proof
```

Override `NETWORK` or `PACKAGE_ID` if you want to verify a different deployment:

```
NETWORK=testnet PACKAGE_ID=0x... npm run verify:proof
```

## Run
```
npm run keeper          # single pass — for cron / systemd timer
npm run keeper:watch    # loop every KEEPER_INTERVAL_MS
```

### As a cron job (single pass each run)
```
*/1 * * * * cd /opt/bequest/packages/keeper && /usr/bin/npm run keeper >> keeper.log 2>&1
```

### As a systemd service (long-running watch)
```ini
[Service]
WorkingDirectory=/opt/bequest/packages/keeper
ExecStart=/usr/bin/npm run keeper:watch
Restart=always
EnvironmentFile=/opt/bequest/packages/keeper/.env
```

## Test it
`npm run seed` creates an estate with `inactivity=grace=0` (immediately eligible). Then run the
keeper twice: tick 1 arms it (ACTIVE→PENDING), tick 2 finalizes it (→TRIGGERED) and distributes any
escrowed assets; further ticks are no-ops. Override the seed timers with `SEED_INACTIVITY_MS` /
`SEED_GRACE_MS`. (`seed` creates an empty estate; deposit a coin/object first to see distribution.)

## Notes
- On `TRIGGERED` the keeper pushes the inheritance automatically — it enumerates every escrowed
  `CoinKey<T>` balance and ObjectBag object and distributes each in one PTB. A heir's own (sponsored)
  claim can still push distribution sooner; the keeper is the safety net.
- Warning emails/SMS during the grace window are not implemented here — that's a notification layer
  to add on top (the on-chain grace period is what makes warnings safe).
