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
  executor: string | null;
  inactivity_ms: string;
  grace_ms: string;
  last_active_ms: string;
  pending_since_ms: string;
  heirs: RawHeir[];
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

function objectAsset(objectType: string, objectId?: string): Asset {
  const id = objectId ? shortObjectId(objectId) : "object";
  if (objectType.endsWith("::staking_pool::StakedSui")) {
    return {
      type: "POSITION",
      label: "Staked SUI position",
      value: id,
      state: "escrowed",
      objectId,
      objectType,
      note: "native Sui stake object",
    };
  }
  return {
    type: "OBJECT",
    label: shortType(objectType),
    value: id,
    state: "escrowed",
    objectId,
    objectType,
  };
}

type Rpc = ReturnType<typeof rpc>;

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
      assets.push({
        type: sui ? "SUI" : "COIN",
        label: sui ? "SUI balance" : `${shortType(coinType)} balance`,
        value: sui ? `${Number(value) / 10 ** SUI_DECIMALS} SUI` : value,
        state: "escrowed",
      });
    }
    cursor = page.hasNextPage ? page.nextCursor : null;
  } while (cursor);
  return assets;
}

// Escrowed objects (NFTs / positions) live in the Estate's ObjectBag, keyed by object id.
async function readObjectAssets(client: Rpc, bagId: string): Promise<Asset[]> {
  const assets: Asset[] = [];
  let cursor: string | null | undefined = null;
  do {
    const page = await client.getDynamicFields({ parentId: bagId, cursor });
    for (const df of page.data) {
      assets.push(objectAsset(df.objectType ?? "object", df.objectId));
    }
    cursor = page.hasNextPage ? page.nextCursor : null;
  } while (cursor);
  return assets;
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

  const pendingSinceMs = Number(fields.pending_since_ms);

  const [coinAssets, objectAssets] = await Promise.all([
    readCoinAssets(client, estateId),
    readObjectAssets(client, fields.objects.fields.id.id),
  ]);

  return {
    estateId,
    owner: fields.owner,
    ownerLabel: shortAddress(fields.owner),
    status: STATUS_BY_CODE[fields.status] ?? "Active",
    inactivityMs: Number(fields.inactivity_ms),
    gracePeriodMs: Number(fields.grace_ms),
    executor: fields.executor ? shortAddress(fields.executor) : "None",
    executorAddress: fields.executor ?? undefined,
    heirs,
    assets: [...coinAssets, ...objectAssets],
    lastActive: new Date(Number(fields.last_active_ms)).toISOString(),
    pendingSince:
      pendingSinceMs > 0 ? new Date(pendingSinceMs).toISOString() : undefined,
    wishesBlobId: "",
  };
}
