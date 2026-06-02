import type { EstateStatus } from "./types.js";

/**
 * The five canonical events of the Sui Succession Standard (SSS v0). An indexer
 * or keeper that watches these can drive and reconstruct any compliant policy's
 * lifecycle and payout history with no implementation-specific knowledge.
 * See `docs/sss-v0.md` section 3.
 */
export type SuccessionEventKind =
  | "PolicyCreated"
  | "Armed"
  | "Triggered"
  | "Reset"
  | "Claimed";

export type PolicyCreated = {
  kind: "PolicyCreated";
  policyId: string;
  owner: string;
  triggerKind: number;
  inactivityMs?: number;
  graceMs?: number;
};

export type Armed = {
  kind: "Armed";
  policyId: string;
  armedAtMs: number;
  eligibleAtMs: number;
};

export type Triggered = {
  kind: "Triggered";
  policyId: string;
  triggeredAtMs: number;
};

export type Reset = {
  kind: "Reset";
  policyId: string;
  /** 0 = owner heartbeat, 1 = executor pause. */
  reason: number;
};

export type Claimed = {
  kind: "Claimed";
  policyId: string;
  recipient: string;
  amount: string;
  assetType: string;
};

export type SuccessionEvent = PolicyCreated | Armed | Triggered | Reset | Claimed;

/**
 * Structural shape of a Sui event, so this package carries no SDK dependency.
 * `@mysten/sui`'s `SuiEvent` is assignable to this.
 */
export type SuiEventEnvelope = {
  /** Fully-qualified Move event type, e.g. `0xPKG::estate::EstateCreated`. */
  type: string;
  /** Decoded Move struct fields. */
  parsedJson?: unknown;
  /** Optional emit time in ms. */
  timestampMs?: string | number | null;
};

/**
 * Maps an implementation's Move event struct short-name to a canonical kind.
 * Register your implementation's event names here; unknown names are ignored.
 */
export type EventAliasMap = Record<string, SuccessionEventKind>;

/**
 * Bequest reference aliases. `EstateCreated` is the verified name emitted by the
 * current testnet package; the canonical names are kept as identity aliases so
 * future implementations that adopt them parse with no extra config.
 */
export const BEQUEST_EVENT_ALIASES: EventAliasMap = {
  EstateCreated: "PolicyCreated",
  PolicyCreated: "PolicyCreated",
  Armed: "Armed",
  Triggered: "Triggered",
  Reset: "Reset",
  Claimed: "Claimed",
};

function shortName(type: string): string {
  const noGenerics = type.split("<")[0] ?? type;
  const parts = noGenerics.split("::");
  return parts[parts.length - 1] ?? noGenerics;
}

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}

function str(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  return "";
}

function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string" && v.trim() !== "") return Number(v);
  return 0;
}

/**
 * Parse one raw Sui event into a typed canonical event, or null if the event is
 * not part of the succession standard. Field names are matched leniently
 * (snake_case or camelCase) so the same parser works across implementations.
 */
export function parseSuccessionEvent(
  env: SuiEventEnvelope,
  aliases: EventAliasMap = BEQUEST_EVENT_ALIASES,
): SuccessionEvent | null {
  const kind = aliases[shortName(env.type)];
  if (!kind) return null;
  const f = asRecord(env.parsedJson);
  const policyId = str(
    f.policy_id ?? f.estate_id ?? f.estateId ?? f.policyId ?? f.id,
  );
  const ts = env.timestampMs ?? undefined;
  switch (kind) {
    case "PolicyCreated":
      return {
        kind,
        policyId,
        owner: str(f.owner),
        triggerKind: num(f.trigger_kind ?? f.triggerKind),
        inactivityMs: num(f.inactivity_ms ?? f.inactivityMs) || undefined,
        graceMs: num(f.grace_ms ?? f.gracePeriodMs ?? f.graceMs) || undefined,
      };
    case "Armed":
      return {
        kind,
        policyId,
        armedAtMs: num(f.armed_at_ms ?? f.armedAtMs ?? ts),
        eligibleAtMs: num(f.eligible_at_ms ?? f.eligibleAtMs),
      };
    case "Triggered":
      return {
        kind,
        policyId,
        triggeredAtMs: num(f.triggered_at_ms ?? f.triggeredAtMs ?? ts),
      };
    case "Reset":
      return { kind, policyId, reason: num(f.reason) };
    case "Claimed":
      return {
        kind,
        policyId,
        recipient: str(f.recipient ?? f.heir),
        amount: str(f.amount ?? f.value),
        assetType: str(f.asset_type ?? f.assetType ?? f.coin_type),
      };
  }
}

/** Parse a batch, dropping events that are not part of the standard. */
export function parseSuccessionEvents(
  envs: SuiEventEnvelope[],
  aliases: EventAliasMap = BEQUEST_EVENT_ALIASES,
): SuccessionEvent[] {
  const out: SuccessionEvent[] = [];
  for (const env of envs) {
    const parsed = parseSuccessionEvent(env, aliases);
    if (parsed) out.push(parsed);
  }
  return out;
}

/** The read-model an indexer or keeper folds events into. */
export type LifecycleView = {
  policyId: string;
  status: EstateStatus;
  owner?: string;
  triggerKind?: number;
  armedAtMs?: number;
  eligibleAtMs?: number;
  triggeredAtMs?: number;
  claims: Claimed[];
};

/**
 * Fold canonical events (in chronological order) into the current lifecycle
 * state. If `policyId` is given, only that policy's events are considered.
 * `status` never advances past "Triggered": "Claimed" is derived from knowing
 * the escrow is empty, which events alone do not carry.
 */
export function foldLifecycle(
  events: SuccessionEvent[],
  policyId?: string,
): LifecycleView {
  const view: LifecycleView = {
    policyId: policyId ?? "",
    status: "Active",
    claims: [],
  };
  for (const e of events) {
    if (policyId && e.policyId !== policyId) continue;
    if (!view.policyId) view.policyId = e.policyId;
    switch (e.kind) {
      case "PolicyCreated":
        view.owner = e.owner;
        view.triggerKind = e.triggerKind;
        view.status = "Active";
        break;
      case "Armed":
        view.armedAtMs = e.armedAtMs;
        view.eligibleAtMs = e.eligibleAtMs;
        view.status = "Pending";
        break;
      case "Reset":
        view.armedAtMs = undefined;
        view.eligibleAtMs = undefined;
        view.status = "Active";
        break;
      case "Triggered":
        view.triggeredAtMs = e.triggeredAtMs;
        view.status = "Triggered";
        break;
      case "Claimed":
        view.claims.push(e);
        break;
    }
  }
  return view;
}
