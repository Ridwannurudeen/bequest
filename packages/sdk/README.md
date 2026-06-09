# @bequest/sdk

TypeScript SDK for [Bequest](../../README.md) on-chain succession on Sui, and the
reference client for the **Sui Succession Standard (SSS v0)** ([`docs/sss-v0.md`](../../docs/sss-v0.md)).

It ships three things:

1. the **frozen `BequestSdk` interface** (the Lane A / Lane B contract);
2. **status helpers** that bridge the product names and the on-chain `u8` (0/1/2);
3. **read helpers over the five canonical events**, so any indexer or keeper can
   reconstruct a policy's lifecycle and payout history with no contract-specific code.

The package has no runtime dependencies. The Sui event parser works structurally,
so `@mysten/sui`'s `SuiEvent` is assignable to its input type without importing it.

## Install

```bash
npm install @bequest/sdk
```

## The interface

```ts
import type { BequestSdk } from "@bequest/sdk";
import { createMockClient } from "@bequest/sdk";

// In-memory client for frontend dev and tests; swap for the live signing client later.
const sdk: BequestSdk = createMockClient();

const estateId = await sdk.createEstate({
  ownerLabel: "Grandma Sarah",
  heirs: [
    { label: "Maya", binding: "google:maya@example.com", ratioBps: 7000 },
    { label: "Noah", binding: "google:noah@example.com", ratioBps: 3000 },
  ],
  inactivityMs: 1000 * 60 * 60 * 24 * 180,
  gracePeriodMs: 1000 * 60 * 60 * 24 * 14,
});

const estate = await sdk.readEstate(estateId); // EstateView
```

Methods: `createEstate`, `deposit`, `setHeirs`, `heartbeat`, `armTrigger`, `claim`,
`executorOverride`, `readEstate`, `uploadWishes`, `decryptWishes`.

## Implementation status

The SDK is intentionally ahead of the current testnet package so the frontend can keep a stable
Lane A / Lane B contract. Do not describe every method as on-chain-backed yet.

| Method / capability | Current status |
| --- | --- |
| `createEstate`, `deposit`, `heartbeat`, `armTrigger`, `executorOverride`, `claim`, `readEstate` | Backed by the deployed `estate` package or live read-model flow. |
| `claim` gas sponsorship | Enoki-ready path; only call it proven after a sponsored Sui digest is pinned. |
| `setHeirs` after creation | Roadmap. The current package stores heirs at creation but does not expose a beneficiary-update entrypoint. |
| `uploadWishes` / `decryptWishes` metadata binding | Roadmap/product surface. Seal/Walrus conditional decrypt is proven, but the current package does not store a wishes blob id on-chain. |

## Status

```ts
import { SuccessionStatus, statusName, isClaimable } from "@bequest/sdk";

SuccessionStatus.TRIGGERED; // 2
statusName(2); // "Triggered"
isClaimable(2); // true  -> heirs may claim, Seal decryption unlocked
```

`status: u8` is `0 ACTIVE / 1 PENDING / 2 TRIGGERED`. "Claimed" is a derived
product state (TRIGGERED with the escrow emptied), not a distinct on-chain status.

## Reading canonical events

The standard defines five events: `PolicyCreated`, `Armed`, `Triggered`, `Reset`,
`Claimed`. Parse raw Sui events into typed ones, then fold them into a read-model:

```ts
import { parseSuccessionEvents, foldLifecycle } from "@bequest/sdk";

// `rawEvents` from suiClient.queryEvents(...). Field names are matched leniently.
const events = parseSuccessionEvents(rawEvents);
const view = foldLifecycle(events, estateId);

view.status;        // "Active" | "Pending" | "Triggered"
view.triggeredAtMs; // when it fired
view.claims;        // every payout, with recipient / amount / assetType
```

Implementations register their own Move event struct names via an alias map. The
default `BEQUEST_EVENT_ALIASES` maps the verified `EstateCreated` to `PolicyCreated`;
register the rest for your package:

```ts
import { parseSuccessionEvent, type EventAliasMap } from "@bequest/sdk";

const aliases: EventAliasMap = {
  MyCreated: "PolicyCreated",
  MyArmed: "Armed",
  MyTriggered: "Triggered",
  MyReset: "Reset",
  MyClaimed: "Claimed",
};
const e = parseSuccessionEvent(rawEvent, aliases);
```

## Build

```bash
npm install
npm run typecheck   # tsc --noEmit
npm run build       # emits dist/ (ESM + .d.ts)
```

## Status of this package

`v0.1.0`, pre-publish. The interface is frozen and matches the web app's local
`bequest-sdk`. Follow-ups: point `packages/web` at this package (workspace dep),
and add a live `createOnchainClient(suiClient, packageId)` once the signing layer
lands. The reference Move implementation is published on Sui testnet at
`0x1eb5d739100981217e4db2d5787d0f005f34efc31db8dc9369ea491fdb731272`.
