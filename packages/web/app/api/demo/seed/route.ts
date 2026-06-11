import {
  SuiJsonRpcClient,
  getJsonRpcFullnodeUrl,
  type SuiObjectChangeCreated,
} from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { fromHex, toHex } from "@mysten/sui/utils";
import { SealClient } from "@mysten/seal";
import { getPublicConfig } from "../../../../lib/config";
import { resolvedPackageId } from "../../../../lib/claim-receipt";

export const dynamic = "force-dynamic";

const OBJECT_ID = /^0x[0-9a-fA-F]{64}$/;
const SUI_TYPE = "0x2::sui::SUI";
const DEPOSIT_MIST = 20_000_000; // 0.02 SUI escrowed into each demo estate
const WALRUS_EPOCHS = 30;
const LETTER =
  "You are the one I trusted with this. Everything I set aside is yours now — use it well, and know you were loved. — from someone who planned ahead";

// Mysten testnet Seal key servers (bare object ids; 0x added at runtime). Must match
// components/wishes-letter.tsx so the recipient can decrypt what we encrypt here.
const KEY_SERVER_IDS = [
  "73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75",
  "f5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8",
].map((id) => `0x${id}`);
const SEAL_THRESHOLD = 2;

const WALRUS_PUBLISHER =
  process.env.WALRUS_PUBLISHER ??
  "https://publisher.walrus-testnet.walrus.space";

// In-memory rate limiting (next start is a long-lived server, so this persists across requests).
// Protects the funded demo key: one estate per IP per cooldown, plus a global daily ceiling.
const IP_COOLDOWN_MS = 2 * 60_000;
const GLOBAL_DAILY_CAP = 40;
const lastSeedByIp = new Map<string, number>();
const daily = { count: 0, windowStart: Date.now() };

function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function walrusPut(bytes: Uint8Array, epochs: number): Promise<string> {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const res = await fetch(`${WALRUS_PUBLISHER}/v1/blobs?epochs=${epochs}`, {
    method: "PUT",
    body: buffer,
  });
  if (!res.ok) throw new Error(`Walrus publisher HTTP ${res.status}`);
  const j = (await res.json()) as {
    newlyCreated?: { blobObject: { blobId: string } };
    alreadyCertified?: { blobId: string };
  };
  const blobId =
    j.newlyCreated?.blobObject.blobId ?? j.alreadyCertified?.blobId;
  if (!blobId) throw new Error("Walrus publisher returned no blobId");
  return blobId;
}

export async function POST(request: Request) {
  const secretKey = process.env.DEMO_SEED_SECRET_KEY;
  if (!secretKey) {
    return json(
      { error: "Demo seeder is not configured (DEMO_SEED_SECRET_KEY unset)." },
      503,
    );
  }

  let body: { recipient?: string };
  try {
    body = (await request.json()) as { recipient?: string };
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }
  const recipient = body.recipient?.trim();
  if (!recipient || !OBJECT_ID.test(recipient)) {
    return json(
      { error: "A valid zkLogin recipient address is required." },
      400,
    );
  }

  // Rate limit
  const now = Date.now();
  if (now - daily.windowStart > 24 * 60 * 60_000) {
    daily.count = 0;
    daily.windowStart = now;
  }
  if (daily.count >= GLOBAL_DAILY_CAP) {
    return json(
      { error: "The demo seeder hit its daily cap. Try again tomorrow." },
      429,
    );
  }
  const ip = clientIp(request);
  const last = lastSeedByIp.get(ip);
  if (last && now - last < IP_COOLDOWN_MS) {
    const wait = Math.ceil((IP_COOLDOWN_MS - (now - last)) / 1000);
    return json(
      { error: `One demo per couple of minutes — try again in ${wait}s.` },
      429,
    );
  }

  const config = getPublicConfig();
  const pkg = resolvedPackageId(config);
  const moduleName = config.estateModule;
  if (!pkg) return json({ error: "Package id is not configured." }, 503);

  const client = new SuiJsonRpcClient({
    url: getJsonRpcFullnodeUrl(config.network),
    network: config.network,
  });
  const keypair = Ed25519Keypair.fromSecretKey(secretKey);

  async function send(tx: Transaction, withChanges = false) {
    let lastErr: unknown;
    for (let i = 0; i < 4; i += 1) {
      try {
        const res = await client.signAndExecuteTransaction({
          signer: keypair,
          transaction: tx,
          options: withChanges
            ? { showObjectChanges: true, showEffects: true }
            : { showEffects: true },
        });
        await client.waitForTransaction({ digest: res.digest });
        if (res.effects?.status?.status === "failure") {
          throw new Error(`tx aborted: ${JSON.stringify(res.effects.status)}`);
        }
        return res;
      } catch (error) {
        lastErr = error;
        await new Promise((r) => setTimeout(r, 2500));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("tx failed");
  }

  try {
    // Reserve a slot up front so a slow seed can't be raced into draining the key.
    daily.count += 1;
    lastSeedByIp.set(ip, now);

    // 1. Create a triggered-soon estate naming the visitor as sole recipient (timers 0).
    const createTx = new Transaction();
    createTx.moveCall({
      target: `${pkg}::${moduleName}::create_estate`,
      arguments: [
        createTx.pure.vector("address", [recipient]),
        createTx.pure.vector("u64", [10000]),
        createTx.pure.option("address", null),
        createTx.pure.u64(0),
        createTx.pure.u64(0),
        createTx.object.clock(),
      ],
    });
    const createRes = await send(createTx, true);
    const created = createRes.objectChanges?.find(
      (c): c is SuiObjectChangeCreated =>
        c.type === "created" &&
        c.objectType.endsWith(`::${moduleName}::Estate`),
    );
    if (!created) throw new Error("Estate not found in object changes");
    const estateId = created.objectId;

    // 2. Escrow a little SUI for the recipient to claim.
    const depositTx = new Transaction();
    const [coin] = depositTx.splitCoins(depositTx.gas, [DEPOSIT_MIST]);
    depositTx.moveCall({
      target: `${pkg}::${moduleName}::deposit_coin`,
      typeArguments: [SUI_TYPE],
      arguments: [depositTx.object(estateId), coin, depositTx.object.clock()],
    });
    await send(depositTx);

    // 3. Seal-encrypt a letter bound to [estate id][nonce], store on Walrus.
    const nonce = crypto.getRandomValues(new Uint8Array(8));
    const innerId = new Uint8Array([...fromHex(estateId), ...nonce]);
    const innerIdHex = toHex(innerId);
    const seal = new SealClient({
      suiClient: client,
      serverConfigs: KEY_SERVER_IDS.map((objectId) => ({
        objectId,
        weight: 1,
      })),
      verifyKeyServers: false,
    });
    const { encryptedObject } = await seal.encrypt({
      threshold: SEAL_THRESHOLD,
      packageId: pkg,
      id: innerIdHex,
      data: new TextEncoder().encode(LETTER),
    });
    const wishesBlobId = await walrusPut(encryptedObject, WALRUS_EPOCHS);

    // 4. Trigger the estate (timers are 0, so both fire immediately).
    const triggerTx = new Transaction();
    triggerTx.moveCall({
      target: `${pkg}::${moduleName}::arm`,
      arguments: [triggerTx.object(estateId), triggerTx.object.clock()],
    });
    triggerTx.moveCall({
      target: `${pkg}::${moduleName}::finalize`,
      arguments: [triggerTx.object(estateId), triggerTx.object.clock()],
    });
    await send(triggerTx);

    return json({ estateId, wishesBlobId, wishesInnerIdHex: innerIdHex }, 200);
  } catch (error) {
    // Roll back the rate-limit slot so a failed seed doesn't burn a visitor's turn.
    daily.count = Math.max(0, daily.count - 1);
    lastSeedByIp.delete(ip);
    console.error("Demo seed failed:", error);
    return json(
      {
        error:
          error instanceof Error
            ? `Demo seed failed: ${error.message}`
            : "Demo seed failed.",
      },
      500,
    );
  }
}
