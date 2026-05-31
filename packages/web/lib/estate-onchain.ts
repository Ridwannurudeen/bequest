import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { getPublicConfig, type PublicBequestConfig } from "./config";
import { resolvedPackageId } from "./claim-receipt";
import type { EstateStatus, EstateView, HeirBinding } from "./bequest-sdk";

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
};

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

/**
 * Read an on-chain Estate into the EstateView the UI consumes. Maps the verified core fields
 * (owner, status, timers, heirs); asset enumeration (escrowed coin balances + ObjectBag objects)
 * is a follow-up, so `assets` is empty and `wishesBlobId` (off-chain on Walrus) is left blank.
 */
export async function readEstateOnChain(
  estateId: string,
  config: PublicBequestConfig = getPublicConfig(),
): Promise<EstateView> {
  const res = await rpc(config).getObject({
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

  return {
    estateId,
    owner: fields.owner,
    ownerLabel: shortAddress(fields.owner),
    status: STATUS_BY_CODE[fields.status] ?? "Active",
    inactivityMs: Number(fields.inactivity_ms),
    gracePeriodMs: Number(fields.grace_ms),
    executor: fields.executor ? shortAddress(fields.executor) : "None",
    heirs,
    assets: [],
    lastActive: new Date(Number(fields.last_active_ms)).toISOString(),
    pendingSince:
      pendingSinceMs > 0 ? new Date(pendingSinceMs).toISOString() : undefined,
    wishesBlobId: "",
  };
}
