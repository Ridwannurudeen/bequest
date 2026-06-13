import {
  SuiJsonRpcClient,
  getJsonRpcFullnodeUrl,
  type EventId,
} from "@mysten/sui/jsonRpc";
import { getPublicConfig, type PublicBequestConfig } from "./config";
import { resolvedPackageId } from "./claim-receipt";
import type {
  Asset,
  EstateStatus,
  EstateView,
  HeirBinding,
} from "./bequest-sdk";

// On-chain estate::Estate fields as returned by getObject(showContent). Numeric Move fields
// (u64 timers, heir bps) come back as decimal strings; status is a u8 number; executor is the
// Option<address> value or null. Verified against the live testnet package on 2026-05-31.
type RawHeir = { fields: { addr: string; bps: string } };

type RawEstateFields = {
  owner: string;
  status: number;
  trigger_kind: number;
  executor: string | null;
  inactivity_ms: string;
  grace_ms: string;
  release_at_ms: string;
  last_active_ms: string;
  pending_since_ms: string;
  triggered_at_ms?: string;
  vesting?: { fields: { cliff_ms: string; duration_ms: string } } | null;
  heirs: RawHeir[];
  guardians: string[];
  recovery_threshold: string;
  recovery: { fields: { new_owner: string; approvals: string[] } } | null;
  objects: { fields: { id: { id: string }; size: string } };
};

// A `Balance<T>` stored as a dynamic field surfaces as a Field whose `value` is the u64 as a
// decimal string. Verified against the live testnet package on 2026-05-31.
type RawBalanceField = { value: string };

const SUI_DECIMALS = 9;

function isSuiType(coinType: string): boolean {
  const parts = coinType.split("::");
  if (parts.length !== 3) return false;
  const [addr, mod, name] = parts;
  // SUI's package address is 0x2; it can appear short (`0x2`) or zero-padded (`0x00…02`).
  return mod === "sui" && name === "SUI" && addr.replace(/^0x0*/, "") === "2";
}

// `module::Struct` from a fully-qualified type, dropping address + generics.
function shortType(t: string): string {
  return t.split("<")[0].split("::").slice(-2).join("::");
}

// Coin type T out of `<pkg>::estate::CoinKey<T>`, or null if the field is not a CoinKey.
function coinTypeFromCoinKey(nameType: string): string | null {
  const m = nameType.match(/::estate::CoinKey<(.+)>$/);
  return m ? m[1] : null;
}

const STATUS_BY_CODE: Record<number, EstateStatus> = {
  0: "Active",
  1: "Pending",
  2: "Triggered",
};

function vestedBps(
  status: EstateStatus,
  triggeredAtMs: number,
  cliffMs: number,
  durationMs: number,
): number {
  if (status !== "Triggered" || triggeredAtMs <= 0) return 0;
  const elapsed = Math.max(0, Date.now() - triggeredAtMs);
  if (elapsed < cliffMs) return 0;
  if (elapsed >= durationMs) return 10000;
  return Math.floor((elapsed * 10000) / durationMs);
}

function rpc(config: PublicBequestConfig) {
  return new SuiJsonRpcClient({
    url: getJsonRpcFullnodeUrl(config.network),
    network: config.network,
  });
}

function shortAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function shortObjectId(id: string) {
  return `${id.slice(0, 8)}…${id.slice(-6)}`;
}

const STAKED_SUI_TYPE_SUFFIX = "::staking_pool::StakedSui";

function isStakedSui(objectType: string): boolean {
  return objectType.endsWith(STAKED_SUI_TYPE_SUFFIX);
}

// MIST (1e9 per SUI) -> a trimmed SUI string: 1000000000 -> "1", 1012300000 -> "1.0123".
function mistToSui(mist: number, dp = 4): string {
  return (mist / 10 ** SUI_DECIMALS).toLocaleString("en-US", {
    maximumFractionDigits: dp,
  });
}

// A native StakedSui auto-compounds via the pool exchange rate, so the escrowed position grows
// while held. `getStakesByIds` returns the live principal and (once Active) the estimatedReward,
// both in MIST, keyed by StakedSui object id. Best-effort: on any RPC error we fall back to the
// bare position so the asset still renders.
type StakeValue = {
  principalMist: number;
  rewardMist: number;
  active: boolean;
};

async function stakeValuesByObjectId(
  client: Rpc,
  stakedSuiIds: string[],
): Promise<Map<string, StakeValue>> {
  const out = new Map<string, StakeValue>();
  if (stakedSuiIds.length === 0) return out;
  try {
    const delegated = await client.getStakesByIds({ stakedSuiIds });
    for (const ds of delegated) {
      for (const s of ds.stakes) {
        if (s.status === "Active") {
          out.set(s.stakedSuiId, {
            principalMist: Number(s.principal),
            rewardMist: Number(s.estimatedReward),
            active: true,
          });
        } else {
          out.set(s.stakedSuiId, {
            principalMist: Number(s.principal),
            rewardMist: 0,
            active: false,
          });
        }
      }
    }
  } catch {
    // Stake lookup is best-effort; the position still renders without live numbers.
  }
  return out;
}

// The escrowed StakedSui as an Asset: value is the current worth (principal + accrued rewards),
// and the note spells out the growth so the "estate grows while held" story is visible.
function stakedAsset(
  objectType: string,
  objectId: string | undefined,
  stake: StakeValue | undefined,
): Asset {
  if (!stake) {
    return {
      type: "POSITION",
      label: "Staked SUI",
      value: objectId ? shortObjectId(objectId) : "stake",
      state: "escrowed",
      objectId,
      objectType,
      note: "native Sui stake position",
    };
  }
  const total = stake.principalMist + stake.rewardMist;
  return {
    type: "POSITION",
    label: "Staked SUI",
    value: `${mistToSui(total)} SUI`,
    state: "escrowed",
    objectId,
    objectType,
    note: stake.active
      ? `${mistToSui(stake.principalMist)} SUI staked · +${mistToSui(stake.rewardMist)} SUI earned`
      : `${mistToSui(stake.principalMist)} SUI staked · activating`,
  };
}

// Generic escrowed object (NFT / other key+store) that is not a recognised position.
function objectAsset(objectType: string, objectId?: string): Asset {
  return {
    type: "OBJECT",
    label: shortType(objectType),
    value: objectId ? shortObjectId(objectId) : "object",
    state: "escrowed",
    objectId,
    objectType,
  };
}

type Rpc = ReturnType<typeof rpc>;

type CoinMetadata = {
  symbol?: string;
  decimals?: number;
};

const coinMetadataCache = new Map<string, Promise<CoinMetadata | null>>();

async function coinMetadata(
  client: Rpc,
  coinType: string,
): Promise<CoinMetadata | null> {
  const cached = coinMetadataCache.get(coinType);
  if (cached) return cached;
  const next = client
    .getCoinMetadata({ coinType })
    .then((m) => (m ? { symbol: m.symbol, decimals: m.decimals } : null))
    .catch(() => null);
  coinMetadataCache.set(coinType, next);
  return next;
}

function formatBaseUnits(value: string, decimals: number): string {
  const raw = BigInt(value);
  const scale = BigInt(10) ** BigInt(decimals);
  const whole = raw / scale;
  const fraction = raw % scale;
  if (fraction === BigInt(0)) return whole.toLocaleString("en-US");
  const padded = fraction.toString().padStart(decimals, "0");
  const trimmed = padded.replace(/0+$/, "");
  return `${whole.toLocaleString("en-US")}.${trimmed}`;
}

// Escrowed coin balances: each is a `CoinKey<T>` dynamic field on the Estate whose value is a
// `Balance<T>`. We page through all dynamic fields and read each balance amount.
async function readCoinAssets(client: Rpc, estateId: string): Promise<Asset[]> {
  const assets: Asset[] = [];
  let cursor: string | null | undefined = null;
  do {
    const page = await client.getDynamicFields({ parentId: estateId, cursor });
    for (const df of page.data) {
      const coinType =
        typeof df.name?.type === "string"
          ? coinTypeFromCoinKey(df.name.type)
          : null;
      if (!coinType) continue;
      const field = await client.getDynamicFieldObject({
        parentId: estateId,
        name: df.name,
      });
      const content = field.data?.content;
      const value =
        content?.dataType === "moveObject"
          ? (content.fields as unknown as RawBalanceField).value
          : "0";
      const sui = isSuiType(coinType);
      const metadata = await coinMetadata(client, coinType);
      const symbol = metadata?.symbol ?? (sui ? "SUI" : shortType(coinType));
      const decimals = metadata?.decimals ?? (sui ? SUI_DECIMALS : 0);
      assets.push({
        type: sui ? "SUI" : "COIN",
        label: `${symbol} balance`,
        value: `${formatBaseUnits(value, decimals)} ${symbol}`,
        state: "escrowed",
        note: sui ? undefined : shortType(coinType),
      });
    }
    cursor = page.hasNextPage ? page.nextCursor : null;
  } while (cursor);
  return assets;
}

// Escrowed objects (NFTs / positions) live in the Estate's ObjectBag, keyed by object id.
async function readObjectAssets(client: Rpc, bagId: string): Promise<Asset[]> {
  const objects: { objectType: string; objectId?: string }[] = [];
  let cursor: string | null | undefined = null;
  do {
    const page = await client.getDynamicFields({ parentId: bagId, cursor });
    for (const df of page.data) {
      objects.push({
        objectType: df.objectType ?? "object",
        objectId: df.objectId,
      });
    }
    cursor = page.hasNextPage ? page.nextCursor : null;
  } while (cursor);

  // Enrich every escrowed StakedSui with its live principal + accrued reward in one batched call.
  const stakedIds = objects
    .filter((o) => isStakedSui(o.objectType) && o.objectId)
    .map((o) => o.objectId as string);
  const stakeValues = await stakeValuesByObjectId(client, stakedIds);

  return objects.map((o) =>
    isStakedSui(o.objectType)
      ? stakedAsset(
          o.objectType,
          o.objectId,
          o.objectId ? stakeValues.get(o.objectId) : undefined,
        )
      : objectAsset(o.objectType, o.objectId),
  );
}

/** Newest estate id from the package's EstateCreated events, or null if none exist. */
export async function findLatestEstate(
  config: PublicBequestConfig = getPublicConfig(),
): Promise<string | null> {
  const page = await rpc(config).queryEvents({
    query: {
      MoveEventType: `${resolvedPackageId(config)}::estate::EstateCreated`,
    },
    limit: 1,
    order: "descending",
  });
  const parsed = page.data[0]?.parsedJson as { estate?: string } | undefined;
  return parsed?.estate ?? null;
}

/** All estate ids from the package's EstateCreated events, newest first. */
export async function listEstates(
  config: PublicBequestConfig = getPublicConfig(),
): Promise<string[]> {
  const client = rpc(config);
  const pkg = resolvedPackageId(config);
  const ids: string[] = [];
  let cursor: EventId | null | undefined = null;
  do {
    const page = await client.queryEvents({
      query: { MoveEventType: `${pkg}::estate::EstateCreated` },
      cursor,
      order: "descending",
      limit: 50,
    });
    for (const ev of page.data) {
      const id = (ev.parsedJson as { estate?: string }).estate;
      if (id) ids.push(id);
    }
    cursor = page.hasNextPage ? page.nextCursor : null;
  } while (cursor);
  return ids;
}

export type LiveStats = {
  estates: number;
  suiUnderContinuity: string;
  triggered: number;
};

/**
 * Best-effort aggregate traction for the proof board: how many estates exist, how much SUI is
 * escrowed across them ("under continuity"), and how many have triggered. Reads are capped and
 * each is fault-tolerant; returns null if the whole sweep fails (flaky testnet RPC) so the caller
 * can simply omit the panel rather than show a broken number.
 */
export async function liveStats(
  config: PublicBequestConfig = getPublicConfig(),
): Promise<LiveStats | null> {
  try {
    const ids = await listEstates(config);
    // Cap the per-estate sweep so the judge-facing proof page stays fast; the headline
    // "estates created" count is the full list, the SUI sum is across the read sample.
    const views = await Promise.all(
      ids
        .slice(0, 24)
        .map((id) => readEstateOnChain(id, config).catch(() => null)),
    );
    let sui = 0;
    let triggered = 0;
    for (const view of views) {
      if (!view) continue;
      if (view.status === "Triggered") triggered += 1;
      for (const asset of view.assets) {
        if (asset.type === "SUI") {
          const amount = Number(asset.value.replace(/[^0-9.]/g, ""));
          if (Number.isFinite(amount)) sui += amount;
        }
      }
    }
    return {
      estates: ids.length,
      suiUnderContinuity: sui.toLocaleString("en-US", {
        maximumFractionDigits: 2,
      }),
      triggered,
    };
  } catch (error) {
    console.warn("liveStats sweep failed:", error);
    return null;
  }
}

/**
 * Read an on-chain Estate into the EstateView the UI consumes: core fields (owner, status, timers,
 * heirs) plus escrowed assets (coin balances via `CoinKey<T>` dynamic fields + ObjectBag objects).
 * `wishesBlobId` (off-chain on Walrus) is left blank — there is no on-chain source for it.
 */
export async function readEstateOnChain(
  estateId: string,
  config: PublicBequestConfig = getPublicConfig(),
): Promise<EstateView> {
  const client = rpc(config);
  const res = await client.getObject({
    id: estateId,
    options: { showContent: true, showType: true },
  });
  const data = res.data;
  if (!data || data.content?.dataType !== "moveObject") {
    throw new Error(`Estate ${estateId} not found on ${config.network}`);
  }
  if (data.type !== `${resolvedPackageId(config)}::estate::Estate`) {
    throw new Error(`Object ${estateId} is not a Bequest Estate`);
  }
  const fields = data.content.fields as unknown as RawEstateFields;

  const heirs: HeirBinding[] = fields.heirs.map((heir) => ({
    label: shortAddress(heir.fields.addr),
    binding: heir.fields.addr,
    ratioBps: Number(heir.fields.bps),
  }));

  const recovery = fields.recovery
    ? {
        newOwner: fields.recovery.fields.new_owner,
        approvals: fields.recovery.fields.approvals ?? [],
      }
    : undefined;

  const pendingSinceMs = Number(fields.pending_since_ms);
  const releaseAtMs = Number(fields.release_at_ms);
  const triggeredAtMs = Number(fields.triggered_at_ms ?? 0);
  const status = STATUS_BY_CODE[fields.status] ?? "Active";
  const vestingFields = fields.vesting?.fields;
  const vesting = vestingFields
    ? {
        cliffMs: Number(vestingFields.cliff_ms),
        durationMs: Number(vestingFields.duration_ms),
        triggeredAtMs: triggeredAtMs > 0 ? triggeredAtMs : undefined,
        vestedBps: vestedBps(
          status,
          triggeredAtMs,
          Number(vestingFields.cliff_ms),
          Number(vestingFields.duration_ms),
        ),
      }
    : undefined;

  const [coinAssets, objectAssets] = await Promise.all([
    readCoinAssets(client, estateId),
    readObjectAssets(client, fields.objects.fields.id.id),
  ]);

  return {
    estateId,
    owner: fields.owner,
    ownerLabel: shortAddress(fields.owner),
    status,
    triggerKind: fields.trigger_kind === 1 ? "scheduled" : "inactivity",
    inactivityMs: Number(fields.inactivity_ms),
    gracePeriodMs: Number(fields.grace_ms),
    releaseAtMs: releaseAtMs > 0 ? releaseAtMs : undefined,
    executor: fields.executor ? shortAddress(fields.executor) : "None",
    executorAddress: fields.executor ?? undefined,
    heirs,
    guardians: fields.guardians ?? [],
    recoveryThreshold: Number(fields.recovery_threshold ?? 0),
    recovery,
    vesting,
    assets: [...coinAssets, ...objectAssets],
    lastActive: new Date(Number(fields.last_active_ms)).toISOString(),
    pendingSince:
      pendingSinceMs > 0 ? new Date(pendingSinceMs).toISOString() : undefined,
    wishesBlobId: "",
  };
}
