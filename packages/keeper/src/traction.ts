/**
 * Bequest traction counter (read-only, no secret key required).
 *
 * Counts real Estate creations on-chain by reading `EstateCreated { estate, owner }` events from
 * the live package, deduping by owner, and excluding the team's own addresses. This is the honest
 * usage signal for submission (#27): distinct non-team owners who created a testnet estate. It
 * never writes and needs no SUI_SECRET_KEY, so judges can run it too.
 *
 *   NETWORK=testnet
 *   PACKAGE_ID=0x696e...                       (defaults to the live testnet package)
 *   BEQUEST_TEAM_ADDRESSES=0xabc...,0xdef...   (csv of owner addresses to exclude)
 *
 * Run:  cd packages/keeper && npm run traction
 */
import "dotenv/config";
import {
  SuiJsonRpcClient,
  getJsonRpcFullnodeUrl,
  type EventId,
} from "@mysten/sui/jsonRpc";

type Network = "testnet" | "mainnet";

const NETWORK = (process.env.NETWORK ?? "testnet") as Network;
const PACKAGE_ID =
  process.env.PACKAGE_ID ??
  "0x1eb5d739100981217e4db2d5787d0f005f34efc31db8dc9369ea491fdb731272";
const GOAL = 20;

const TEAM = new Set(
  (process.env.BEQUEST_TEAM_ADDRESSES ?? "")
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean),
);

interface Created {
  estate: string;
  owner: string;
  timestampMs: number | null;
}

async function collectCreated(
  client: SuiJsonRpcClient,
  pkg: string,
): Promise<Created[]> {
  const out: Created[] = [];
  let cursor: EventId | null = null;
  for (;;) {
    const page = await client.queryEvents({
      query: { MoveEventType: `${pkg}::estate::EstateCreated` },
      cursor,
      limit: 50,
    });
    for (const ev of page.data) {
      const parsed = ev.parsedJson as { estate?: string; owner?: string };
      const owner = (parsed.owner ?? ev.sender ?? "").toLowerCase();
      if (!parsed.estate || !owner) continue;
      out.push({
        estate: parsed.estate,
        owner,
        timestampMs: ev.timestampMs ? Number(ev.timestampMs) : null,
      });
    }
    if (!page.hasNextPage) break;
    cursor = page.nextCursor ?? null;
  }
  return out;
}

function short(addr: string): string {
  return addr.length > 14 ? `${addr.slice(0, 8)}…${addr.slice(-4)}` : addr;
}

async function main(): Promise<void> {
  const client = new SuiJsonRpcClient({
    url: getJsonRpcFullnodeUrl(NETWORK),
    network: NETWORK,
  });

  const created = await collectCreated(client, PACKAGE_ID);

  const byOwner = new Map<string, Created[]>();
  for (const c of created) {
    const list = byOwner.get(c.owner) ?? [];
    list.push(c);
    byOwner.set(c.owner, list);
  }

  const owners = [...byOwner.keys()];
  const nonTeam = owners.filter((o) => !TEAM.has(o));

  console.log("BEQUEST_TRACTION");
  console.log(`network: ${NETWORK}`);
  console.log(`package: ${PACKAGE_ID}`);
  console.log(`total estates created: ${created.length}`);
  console.log(`distinct owners: ${owners.length}`);
  console.log(
    `team addresses excluded: ${TEAM.size}` +
      (TEAM.size === 0
        ? " (set BEQUEST_TEAM_ADDRESSES to exclude your own)"
        : ""),
  );
  console.log(
    `distinct NON-TEAM owners: ${nonTeam.length} / ${GOAL} goal` +
      (nonTeam.length >= GOAL ? "  GOAL MET" : ""),
  );
  console.log("");
  console.log("per-owner breakdown (newest first):");
  const rows = owners
    .map((owner) => {
      const list = byOwner.get(owner) ?? [];
      const last = list.reduce((m, c) => Math.max(m, c.timestampMs ?? 0), 0);
      return { owner, count: list.length, last };
    })
    .sort((a, b) => b.last - a.last);
  for (const row of rows) {
    const tag = TEAM.has(row.owner) ? " [team, excluded]" : "";
    const when = row.last
      ? new Date(row.last).toISOString().slice(0, 10)
      : "?";
    console.log(
      `  ${short(row.owner)}  ${row.count} estate(s)  last ${when}${tag}`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
