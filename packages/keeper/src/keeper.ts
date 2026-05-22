/**
 * Bequest keeper — the off-chain heartbeat monitor.
 *
 * Each tick it: (1) discovers every Estate via `EstateCreated` events, (2) reads each estate's
 * status + timers, and (3) drives the dead-man's switch:
 *     ACTIVE  and now >= last_active + inactivity  -> arm()      (ACTIVE -> PENDING)
 *     PENDING and now >= pending_since + grace      -> finalize() (PENDING -> TRIGGERED)
 * `arm`/`finalize` are permissionless and re-check the Clock on-chain, so the keeper only needs to
 * be roughly right — it can never trigger an estate before its real deadline.
 *
 * Run once (cron/systemd-friendly) or with `--watch` to loop every KEEPER_INTERVAL_MS.
 * Verified against @mysten/sui@2.17.0.
 */
import "dotenv/config";
import {
  SuiJsonRpcClient,
  getJsonRpcFullnodeUrl,
  type EventId,
} from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";

const NETWORK = (process.env.NETWORK ?? "testnet") as "testnet" | "mainnet";
const PACKAGE_ID = process.env.PACKAGE_ID;
const SUI_SECRET_KEY = process.env.SUI_SECRET_KEY;

const STATUS_ACTIVE = 0;
const STATUS_PENDING = 1;

interface EstateFields {
  status: number | string;
  last_active_ms: string;
  inactivity_ms: string;
  grace_ms: string;
  pending_since_ms: string;
}

function requireEnv(): { pkg: string; key: string } {
  if (!PACKAGE_ID || !SUI_SECRET_KEY) {
    console.error(
      "Missing env. Set PACKAGE_ID and SUI_SECRET_KEY (see packages/keeper/README.md).",
    );
    process.exit(1);
  }
  return { pkg: PACKAGE_ID, key: SUI_SECRET_KEY };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function discoverEstates(
  client: SuiJsonRpcClient,
  pkg: string,
): Promise<string[]> {
  const ids: string[] = [];
  let cursor: EventId | null = null;
  for (;;) {
    const page = await client.queryEvents({
      query: { MoveEventType: `${pkg}::estate::EstateCreated` },
      cursor,
      limit: 50,
    });
    for (const ev of page.data) {
      const id = (ev.parsedJson as { estate?: string }).estate;
      if (id) ids.push(id);
    }
    if (!page.hasNextPage) break;
    cursor = page.nextCursor ?? null;
  }
  return ids;
}

async function readEstate(
  client: SuiJsonRpcClient,
  id: string,
): Promise<EstateFields | null> {
  const res = await client.getObject({ id, options: { showContent: true } });
  const content = res.data?.content;
  if (!content || content.dataType !== "moveObject") return null;
  return content.fields as unknown as EstateFields;
}

async function call(
  client: SuiJsonRpcClient,
  keypair: Ed25519Keypair,
  pkg: string,
  fn: "arm" | "finalize",
  estateId: string,
): Promise<string> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${pkg}::estate::${fn}`,
    arguments: [tx.object(estateId), tx.object.clock()],
  });
  const res = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
  });
  await client.waitForTransaction({ digest: res.digest });
  return res.digest;
}

async function tick(
  client: SuiJsonRpcClient,
  keypair: Ed25519Keypair,
  pkg: string,
): Promise<void> {
  const now = Date.now();
  const ids = await discoverEstates(client, pkg);
  console.log(`[${new Date().toISOString()}] ${ids.length} estate(s)`);
  for (const id of ids) {
    const f = await readEstate(client, id);
    if (!f) continue;
    const status = Number(f.status);
    const lastActive = Number(f.last_active_ms);
    const inactivity = Number(f.inactivity_ms);
    const grace = Number(f.grace_ms);
    const pendingSince = Number(f.pending_since_ms);
    const tag = id.slice(0, 10) + "…";
    if (status === STATUS_ACTIVE && now >= lastActive + inactivity) {
      console.log(`  ${tag} inactive → arming`);
      console.log(`    armed (${await call(client, keypair, pkg, "arm", id)})`);
    } else if (status === STATUS_PENDING && now >= pendingSince + grace) {
      console.log(`  ${tag} grace elapsed → finalizing`);
      console.log(
        `    TRIGGERED (${await call(client, keypair, pkg, "finalize", id)})`,
      );
    } else {
      console.log(`  ${tag} status=${status} — no action`);
    }
  }
}

async function main(): Promise<void> {
  const { pkg, key } = requireEnv();
  const client = new SuiJsonRpcClient({
    url: getJsonRpcFullnodeUrl(NETWORK),
    network: NETWORK,
  });
  const keypair = Ed25519Keypair.fromSecretKey(key);
  console.log(
    `keeper ${keypair.toSuiAddress()} · ${NETWORK} · package ${pkg.slice(0, 10)}…`,
  );

  const watch = process.argv.includes("--watch");
  const intervalMs = Number(process.env.KEEPER_INTERVAL_MS ?? 30000);
  do {
    try {
      await tick(client, keypair, pkg);
    } catch (e) {
      console.error("tick error:", e instanceof Error ? e.message : e);
    }
    if (watch) await sleep(intervalMs);
  } while (watch);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
