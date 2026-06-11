# Republish runbook (testnet) — estate.move overhaul (PR #67)

PR #67 changes `estate.move`, so the package must be republished **once**. A republish produces a
**new package id**; every place that pins the old id, and every Enoki allowlist entry (which embeds
the package id), must be re-pointed, then the funded judge estate re-seeded. Run on the machine with
the `sui` CLI + the deploy key (Lane A). There is no local `sui` on the Windows dev box — CI is the
only Move validator, and it is already green on #67.

Old testnet package id (being replaced): `0x696ea0…dcfb885`. The current live package is `0x5224dd7d…35c49d1`, pinned as `currentPackage.packageId` in `packages/web/lib/live-proof.ts`.

## 1. Build & publish
```bash
cd packages/move
sui move test            # sanity (CI already green)
sui client publish --gas-budget 200000000 --json > /tmp/publish.json
```
Capture from the output:
- **packageId** — the `objectChanges` entry with `type: "published"`.
- **publishDigest** — the transaction digest.

## 2. Re-point code pins (4 files — each currently holds the old id)
- `packages/web/lib/live-proof.ts` — `currentPackage.packageId`, `publishDigest`, and `explorerUrl` (all three)
- `packages/keeper/src/verifyProof.ts` — `PACKAGE_ID` default
- `packages/keeper/src/traction.ts` — `PACKAGE_ID` default
- `packages/web/scripts/verify-claim-kind.mjs` — `DEFAULT_PACKAGE_ID`

## 3. Re-point env (local `.env*` + the VPS deploy env — see [bequest-deploy] memory)
Web (`packages/web/.env.local` + `/opt/bequest/web` env):
- `NEXT_PUBLIC_BEQUEST_PACKAGE_ID` = new id  (read in `lib/config.ts`)
- `NEXT_PUBLIC_BEQUEST_WISHES_BLOB_ID` / `NEXT_PUBLIC_BEQUEST_WISHES_INNER_ID` = from step 5 (new judge estate's letter)
- `ENOKI_ALLOWED_MOVE_TARGETS` = regenerate **every** entry with the new id. Sponsored (gasless) targets:
  `estate::create_estate`, `estate::deposit_coin`, `estate::distribute_coin`, `estate::executor_pause`
  (current set), plus as Lane B wires the new owner-manage UI: `estate::heartbeat`,
  `estate::withdraw_coin`, `estate::withdraw_object`, `estate::update_heirs`, `estate::update_executor`,
  `estate::update_timers`, `estate::set_wishes`, `estate::create_scheduled_estate`.
  (`arm`/`finalize`/`finalize_scheduled`/`distribute_*` are permissionless — keeper self-pays, **not** allowlisted.)

Keeper (`packages/keeper/.env`) and wishes (`packages/wishes/.env`):
- `PACKAGE_ID` = new id

Also update the Enoki **Portal** Sponsored-Tx allowlist to match `ENOKI_ALLOWED_MOVE_TARGETS`
(the `.env` fail-closed check and the Portal must agree, or sponsorship 400s).

## 4. Keeper supports scheduled estates (already in PR #67)
`packages/keeper/src/keeper.ts` now branches on `trigger_kind`: scheduled estates go ACTIVE → TRIGGERED
via `finalize_scheduled` once `release_at_ms` is reached (inactivity estates unchanged). No extra action
beyond the env re-point; `npm run typecheck` is green.

## 5. Re-seed the funded judge estate (MUST-DO #1 / #57)
`packages/keeper/src/seed.ts` creates a sole-heir, self-funded estate via the unchanged `create_estate`
signature. For the judge estate the demo needs **2 heirs (70/30), real testnet SUI, an NFT, the Seal
letter, and a held TRIGGERED state**. Either extend `seed.ts` for the 2-heir+fund+wishes case or do it
manually:
1. `create_estate([heirA, heirB],[7000,3000], none, inactivity, grace, clock)` → estate id
2. `deposit_coin<SUI>` real testnet SUI + `deposit_object` an NFT
3. Encrypt + upload the letter for **this estate id + new package** (`packages/wishes`), then
   `set_wishes(estate, blob_id, key_id, digest)` (on-chain anchor, #9) AND set the two
   `NEXT_PUBLIC_BEQUEST_WISHES_*` env vars to match (web reads env until per-estate on-chain read ships, #65)
4. Let it arm → finalize (or set timers=0 and run the keeper twice) so it holds **TRIGGERED**
5. Link only this estate as the demo claim; keep it funded + Triggered through **2026-06-21**

## 6. Verify, then redeploy
```bash
# from packages/web
NEXT_PUBLIC_BEQUEST_PACKAGE_ID=<new> node scripts/verify-claim-kind.mjs
# from packages/keeper
PACKAGE_ID=<new> npm run verify:proof
PACKAGE_ID=<new> npm run traction
```
Then redeploy the web app per the [bequest-deploy] steps (VPS, systemd/nginx). Confirm the homepage
package card shows the new id + digest, and a heir can drive create → live control → trigger → claim →
read the letter on the seeded estate.
