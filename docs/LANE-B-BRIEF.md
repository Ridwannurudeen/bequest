# Lane B brief (@dolepee) — the frontend half of the ALL-IN plan

Your lane is the UI surface. This maps every Lane B issue (#60–#65) to the **new contract surface**
landing in PR #67 (Move + keeper, CI-green), the **files to touch**, the **Enoki allowlist** entries
to add, and **acceptance criteria**. Priority order (from EPIC #66): **#60 → #61 → #65(disclaimer) →
#62 → #63 → #64**.

> **Gate:** all of this consumes the **new package id** from the single republish (`docs/REPUBLISH-RUNBOOK.md`).
> Until that lands you can build against the signatures below; just don't hardcode the old id.

## How a gasless action is wired (the pattern you already use)
`owner-setup.tsx` / `claim-action.tsx` are the templates: build a transaction-**kind** in an
`app/api/.../transaction-kind/route.ts` → `POST /api/enoki/sponsor` → sign with the zkLogin keypair
(`flow.getKeypair().signTransaction`) → `POST /api/enoki/execute`. Read the Enoki **`data` envelope**
(`res.data.bytes` / `res.data.digest`), not top-level. Owner *deposit* is **self-paid** (PR #20), not
sponsored — same choice applies to *withdraw* (the owner pays their own gas). `TxContext` is implicit
in every moveCall — never pass it as an argument.

New sponsored targets to add to **`ENOKI_ALLOWED_MOVE_TARGETS`** (env + Enoki Portal), each as
`<newpkg>::estate::<fn>`: `heartbeat`, `update_heirs`, `update_executor`, `update_timers`,
`set_wishes`, `create_scheduled_estate`. (`withdraw_coin`/`withdraw_object` only if you choose to
sponsor them; default self-paid. `arm`/`finalize`/`finalize_scheduled`/`distribute_*` are
permissionless — never allowlisted.)

## Shared prerequisite (read path) — coordinate with Lane A
`lib/estate-onchain.ts` `readEstateOnChain()` → `EstateView` must surface the new fields so the UI can
branch: `trigger_kind` (0=inactivity, 1=scheduled), `release_at_ms`, and the `wishes` anchor
(`Option<{blob_id, key_id, digest}>`). The keeper added these reads already; mirror the JSON shape here.

---

## #60 — multi-asset claim UI  · P0
Today `claim-receipt.ts` builds a hardcoded `distribute_coin<SUI>`. Make the claim PTB move **every**
asset: enumerate each `CoinKey<T>` + every ObjectBag type and add one `distribute_coin<T>` per coin
type and one `distribute_objects<T>` per object type — the keeper's `distributeAll()` in
`packages/keeper/src/keeper.ts` is the exact reference (reuse its enumeration logic).
- **Contract (permissionless):** `distribute_coin<T>(estate, ctx)`, `distribute_objects<T>(estate, ids: vector<ID>, ctx)`
- **Files:** `lib/claim-receipt.ts`, `app/api/claim/transaction-kind/route.ts`, `components/claim-action.tsx`, `app/claim/[estateId]/page.tsx`
- **+ wishes anchor read (was omitted):** on the claim page, read the estate's on-chain `wishes` anchor and pass `blob_id`/`key_id` to `wishes-letter.tsx` instead of the env pins; verify the fetched Walrus bytes against the on-chain `digest` before showing the letter.
- **Done when:** a heir claims a 2-heir estate holding SUI **+ an NFT** and receives both; the letter renders from the on-chain anchor with a digest match.

## #61 — owner-manage UI  · P0
Wire the new owner mutators + the missing live-control loops.
- **Contract (owner-only, pre-TRIGGERED, all sponsored except withdraw):**
  - `heartbeat(estate, clock, ctx)` — **the "I'm alive" proof-of-life button (was omitted; audit MUST-DO #2)**
  - `update_heirs(estate, heir_addrs: vector<address>, heir_bps: vector<u64>, clock, ctx)` (bps sum 10000)
  - `update_executor(estate, executor: Option<address>, clock, ctx)`
  - `update_timers(estate, inactivity_ms: u64, grace_ms: u64, clock, ctx)`
  - `withdraw_coin<T>(estate, amount: u64, clock, ctx): Coin<T>` — **PTB must `tx.transferObjects([coin], sender)`** (the call returns the coin)
  - `withdraw_object<T>(estate, id: ID, clock, ctx): T` — likewise transfer the returned object to the sender
  - `set_wishes(estate, blob_id, key_id, digest, clock, ctx)` — **owner per-estate letter upload + on-chain anchor (was omitted; wow #9)**; encrypt+upload via the `packages/wishes` flow, then call `set_wishes`
  - `create_scheduled_estate(heir_addrs, heir_bps, executor, release_at_ms, clock, ctx): ID` — **"scheduled gifting / vesting cliff" create option (was omitted; wow #10)**; a date picker → `release_at_ms`
- **Files:** new `components/owner-manage.tsx`, extend `app/api/owner/transaction-kind/route.ts` (add the mutators + scheduled create), `app/create/page.tsx` (scheduled toggle), surface on the owner/`/estates` view.
- **Done when:** an owner can press Heartbeat (resets the timer), edit heirs/executor/timers, withdraw a coin and an object, upload a per-estate letter, and create a scheduled estate — all from the UI.

## #65 — disclaimer + video + testers  · P0 (disclaimer) / ongoing
- Persistent footer: "Sui testnet demo — no real funds; not legal/probate/tax advice" (in README, never in UI).
- Finalize the #51 portfolio surfacing; record the real Grandma→Maya demo video (≤5 min); recruit **3 real non-team testers**.
- **Files:** root layout/footer component; `app/page.tsx`.

## #62 — productive-estate UI  · P1
Wire to Lane A #55 (yield). Show the escrow **compounding** (principal vs. earned), owner-draws-yield.
Depends on #55's on-chain shape — coordinate before building.

## #63 — AI heir-guide / concierge  · P1
A guided heir claim flow (thin → fuller natural-language). Plain-English owner setup if time. This is
the emotional wow in the demo; keep it inside the existing claim page.

## #64 — recovery UI + heir naming  · P2
Wire to Lane A #54 (guardian quorum): guardian setup + recover flow. Name heirs by **Google (zkLogin
address) / SuiNS**, not raw `0x` — resolve the name → address at create time (fixes the "Google heirs"
contradiction, audit MUST-DO #6). Depends on #54's shape.

---

## Completeness note (the three items the issues had omitted)
This brief adds, against the new contract surface, what the original one-line issues left implicit:
**(1)** Heartbeat button in #61, **(2)** per-estate `set_wishes` upload (#61) + on-chain wishes anchor
read (#60), **(3)** `create_scheduled_estate` UI in #61. The issue bodies have been updated to match.
