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
KEEPER_MIN_GAS_MIST=100000000                     # low-gas alert threshold (default 0.1 SUI)

# Owner reminders (optional — see "Owner reminders" below)
RESEND_API_KEY=re_...                             # omit to dry-run (log instead of send)
REMINDER_FROM=Bequest <reminders@yourdomain.com>  # verified Resend sender
REMINDER_LEADS_PCT=50,15                           # nudge at ≤50% and ≤15% of the window left
REMINDERS_STORE=reminders.json                     # contact store path (default)
APP_URL=https://bequest.app                         # check-in link base (optional)
```

```
npm install
npm run typecheck
```

## Verify the live package
This check needs no private key. It reads the published package from Sui RPC and confirms the
estate-only Move surface claimed by the web app.

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

## Owner reminders
A real owner who is merely busy — not dead — would still lose their estate just for forgetting to
press **Still Alive**. So on every tick, for each `ACTIVE` inactivity estate, the keeper checks how
close it is to `last_active + inactivity` and emails the owner *before* it arms, giving them time to
check in. Thresholds are a percent of the window **remaining** (`REMINDER_LEADS_PCT`, default
`50,15`), so they scale to any switch — a 30-day line and a 1-hour demo get the same cadence. Each
threshold fires at most once per cycle; a fresh heartbeat resets the cycle. Set `RESEND_API_KEY` to
actually send (otherwise reminders are logged as a dry-run).

Emails aren't on-chain (privacy), so owners register a contact off-chain. The keeper matches an
estate to a contact by `estateId` first, then by `owner` address:

```
npm run reminder:add -- --estate 0xESTATE --email owner@example.com
npm run reminder:add -- --owner  0xOWNER  --email owner@example.com --leads 50,15
npm run reminder:add -- --list
```

Contacts live in `REMINDERS_STORE` (default `reminders.json`, git-ignored — it holds emails). See
`reminders.example.json`. The store is reloaded each tick, so adds take effect immediately. Run the
decision-logic tests with `npm test`.

> Production note: the JSON store is shared by host. To capture emails from the web app on Vercel,
> swap `loadStore`/`saveStore` in `reminders.ts` for a shared backend (Vercel KV / Postgres).

## V2 full-portfolio validation
`npm run full-portfolio` is the no-redeploy gate for the V2 story. With a funded testnet key, it:

1. Stakes testnet SUI through `0x3::sui_system::request_add_stake` and receives a native
   `StakedSui` object.
2. Creates a two-heir Bequest estate.
3. Deposits liquid SUI plus the `StakedSui` object into the estate, earmarking the stake object to
   heir A.
4. Optionally deposits one caller-owned object/NFT via `BUNDLE_NFT_OBJECT_ID`, earmarking it to
   heir B.
5. Arms, finalizes, distributes, then verifies the liquid SUI split and final object ownership.

```
PACKAGE_ID=0x696...b885 \
SUI_SECRET_KEY=suiprivkey1... \
npm run full-portfolio
```

Optional knobs:

```
BUNDLE_STAKE_MIST=1000000000       # default 1 SUI
BUNDLE_DEPOSIT_MIST=100000000      # default 0.1 SUI
BUNDLE_NFT_OBJECT_ID=0x...         # optional owned key+store object
BUNDLE_REQUIRE_NFT=1               # fail if the optional object is absent
```

Safe proof language:
- `BEQUEST_YIELD_BUNDLE_PASSED` proves liquid SUI plus native `StakedSui` inheritance.
- `BEQUEST_FULL_PORTFOLIO_PASSED` proves liquid SUI plus `StakedSui` plus the optional object.
- Do not claim a live full-portfolio digest until this command prints one of those markers.

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

## Reliability (operating safely)
The keeper is a **convenience, not a trust anchor** — its correctness comes from the contract, not from any single instance.

- **Run 2+ keepers on independent infra.** Every transition (`arm`/`finalize`/`finalize_scheduled`/`distribute_*`) is permissionless and re-checks its condition on-chain, so redundant keepers are safe: if two race, the second simply no-ops or its tx aborts harmlessly (e.g. `distribute_coin` aborts once a type's balance is already removed). More keepers = higher liveness, never double-spend.
- **Low-gas alerting.** Each tick checks the keeper account's own balance and logs `[ALERT] keeper gas low: …` (to stderr) below `KEEPER_MIN_GAS_MIST` (default 0.1 SUI). Point your log/alerting at the `[ALERT]` prefix and fund the account before it can't pay for transitions.
- **Liveness.** Each tick logs `[<ISO timestamp>] N estate(s)`; tick errors are caught and logged `tick error: …` without killing the `--watch` loop. Alert on absence of a recent tick line (stale keeper) and on `tick error:`.
- **Heir self-claim fallback.** Distribution never depends solely on the keeper: after `TRIGGERED`, **anyone** (a heir, the web claim button, or a stranger) can call `distribute_coin<T>` / `distribute_objects<T>` to push the inheritance. If every keeper is down, the inheritance is still claimable on-chain — the keeper only makes it automatic.

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
