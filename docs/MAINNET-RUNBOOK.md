# Bequest — Mainnet Deploy Runbook

Lane A operational runbook for publishing Bequest to **Sui mainnet** and cutting the keeper + web over.
Closes roadmap item #31. Ratified decisions (2026-06-02): **publish `estate.move` only (exclude `gate.move`)**, **publish mutable (retain `UpgradeCap`), secure to multisig before scaling value, immutable only post-audit.**

> Target window: **early August 2026** (ahead of the Aug 27 announcement → 100%-upfront prize).
> Reference testnet package: `0x5224dd7d…35c49d1` (upgrade-cap `0x064022b1…03f124`).

---

## 0. Prerequisites (do not start without all of these)

- [ ] **Sui CLI** with a `mainnet` env. ⚠️ There is **no `sui` CLI on the current Windows dev machine** — run the publish from a machine that has it (A's machine or the VPS `75.119.153.252`, where you can install the same `testnet-v1.72.2`-line release). Do **not** put mainnet keys in CI.
- [ ] **Funded mainnet deploy address** (A's key) with real SUI for publish gas (publish is a few SUI; budget generously).
- [ ] **Funded mainnet keeper address** with real SUI (gas for `arm`/`finalize`/`distribute`).
- [ ] **Enoki app enabled for MAINNET** — a public+private key pair with **mainnet** + zkLogin enabled in the Enoki Portal (the current keys are testnet-scoped). Mainnet sponsorship spends **real SUI** — fund the sponsor and set a cap.
- [ ] Google OAuth client already covers the prod domain (`https://bequest.gudman.xyz/auth`) — network-agnostic, no change.
- [ ] Decisions above ratified; this runbook reviewed.

---

## 1. Pre-publish code prep (one PR, on `lane-a/mainnet-prep`)

1. **Exclude `gate.move`** from the published package: move `packages/move/sources/gate.move` → `packages/move/spikes/gate.move` (or `docs/spikes/`). It is redundant (real `seal_approve` lives in `estate.move:269`) and ships an owner-flippable trigger. Mainnet package = **`estate.move` only**.
2. `sui move test` → expect **11/11** (was 12; `gate::test_status_flip` leaves with the file). Update the count in `packages/move/README.md` and the CI `move` job assertion.
3. **Network-aware explorer URLs (mainnet-readiness bug):** `packages/web/lib/claim-receipt.ts` hardcodes `https://suiscan.xyz/testnet/…` in `explorerObjectUrl`/`explorerTxUrl`. Make them take the network from config (mirror the components, which already use `suiscan.xyz/${NETWORK}/…`). Otherwise every estate/tx link breaks on mainnet.
4. Keep `Move.toml` clean (no pinned deps — implicit system framework). `bequest = "0x0"` stays; Sui sets the address at publish.
5. CI green (web/keeper/move). Merge.

---

## 2. Publish to mainnet

On the machine with `sui` CLI:
```sh
sui client switch --env mainnet
sui client active-address          # confirm = the funded deploy address
cd packages/move
sui move build                     # clean build, estate-only
sui client publish --gas-budget 500000000
```
Capture from the output (and the resulting `Published.toml` `[published.mainnet]` block, which Sui writes automatically — commit it):
- [ ] **Mainnet package ID** → record everywhere (step 5).
- [ ] **`UpgradeCap` object ID** → this is the keys-to-the-kingdom object. Record + secure (step 3).
- [ ] **Publish digest**.

> The published package contains only `bequest::estate`. Verify on SuiScan that `gate` is absent.

---

## 3. Secure the `UpgradeCap` (the trust step)

The publish transfers the `UpgradeCap` to the deployer address. **Do not `make_immutable`** (pre-audit; a bug must remain patchable).

- [ ] **Immediately:** record the `UpgradeCap` object ID; confirm it's owned by the controlled deploy address; back up that key.
- [ ] **Before scaling real value:** transfer the `UpgradeCap` to a **2-of-3 multisig** (and/or a timelock wrapper) so no single key can unilaterally upgrade a contract holding inheritances. Document the multisig signers.
- [ ] **Post-audit + maturity:** revisit immutability or on-chain governance.

---

## 4. Cut the keeper over to mainnet

`packages/keeper/.env` (gitignored):
- [ ] `NETWORK=mainnet`
- [ ] `PACKAGE_ID=<mainnet package id>`
- [ ] `SUI_SECRET_KEY=<mainnet keeper key>` (funded with real SUI)
Restart the keeper; confirm it discovers estates via `EstateCreated` on mainnet and can `arm`/`finalize`/`distribute`.

---

## 5. Cut the web over to mainnet

`packages/web/.env.local` on the VPS (`/opt/bequest/web/.env.local`):
- [ ] `NEXT_PUBLIC_SUI_NETWORK=mainnet`
- [ ] `NEXT_PUBLIC_BEQUEST_PACKAGE_ID=<mainnet package id>`  *(overrides the pinned `currentPackage`; `resolvedPackageId` reads this first)*
- [ ] `ENOKI_PUBLIC_API_KEY` / `ENOKI_PRIVATE_API_KEY` → **mainnet-enabled** keys
- [ ] `ENOKI_ALLOWED_MOVE_TARGETS` → rebuild against the **mainnet** package id: `…::estate::distribute_coin`, `…::estate::create_estate`, `…::estate::deposit_coin`, `…::estate::executor_pause`
- [ ] `NEXT_PUBLIC_GOOGLE_CLIENT_ID` unchanged (domain already allow-listed)

Code (commit, don't just env): update `packages/web/lib/live-proof.ts` `currentPackage` (label/`packageId`/`explorerUrl` → mainnet) so the proof cards are accurate. Then redeploy per `bequest-deploy` (archive → scp → `npm ci && npm run build` with `HOME=/opt/bequest` → `systemctl restart bequest-web`).

---

## 6. Mainnet smoke test (small real value)

End-to-end, with tiny real SUI:
- [ ] Owner **create** estate (short inactivity/grace for the test) — gasless via mainnet Enoki.
- [ ] Owner **deposit** a small SUI amount (self-paid).
- [ ] `arm` → `finalize` (keeper, or wait out the timers).
- [ ] **Heir claim** (gasless) → assets arrive; verify on SuiScan (mainnet links now correct).
- [ ] **Executor pause** on a fresh pending estate → resets to Active.
- [ ] (If wired) **Seal letter** decrypts only after Triggered.
- [ ] Record the mainnet lifecycle digests as proof.

---

## 7. Record + tag

- [ ] Commit `Published.toml` `[published.mainnet]`; update `packages/move/README.md` (mainnet package id) + root README.
- [ ] Record mainnet package id, `UpgradeCap` id, publish digest in memory (`bequest-deploy`).
- [ ] `git tag` a release (e.g. `v1.0.0-mainnet`).
- [ ] Note mainnet package id in the **hackathon submission**.

---

## 8. Contingency (mutable = patchable)

A discovered bug is fixable because we retained the `UpgradeCap`:
```sh
sui client switch --env mainnet
cd packages/move
sui client upgrade --upgrade-capability <UpgradeCap id> --gas-budget 500000000
```
Existing `Estate` shared objects persist across an upgrade (same `original-id`). Test any upgrade on testnet first. If the `UpgradeCap` has been moved to a multisig, the upgrade tx must be assembled + signed by the multisig.

---

## 9. Cost checklist (real SUI)

- [ ] Publish gas (~few SUI).
- [ ] Keeper SUI float (ongoing `arm`/`finalize`/`distribute`).
- [ ] Enoki sponsor SUI float (every gasless create/claim/pause spends real gas now) + a sponsorship cap/rate-limit.
- [ ] Buffer for the smoke test + upgrades.

---

*Mainnet is a trust event. Publish small, keep the cap, secure the cap, prove the lifecycle, then grow AUC.*
