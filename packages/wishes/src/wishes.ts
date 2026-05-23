/**
 * Bequest last-wishes — full Seal + Walrus + estate flow on testnet.
 *
 *   1. Create an Estate (timers = 0, sole heir = signer).
 *   2. Seal-encrypt the letter to the estate's key-id namespace ([estate id][nonce]).
 *   3. Store the ciphertext on Walrus (public testnet publisher) -> blobId.
 *   4. Try to decrypt while the estate is ACTIVE  -> MUST FAIL (estate::seal_approve aborts).
 *   5. arm + finalize the estate                  -> TRIGGERED.
 *   6. Fetch the ciphertext back from Walrus (aggregator) and decrypt -> MUST SUCCEED.
 *
 * Proves the headline feature: an encrypted last-letter, stored durably on Walrus, that is
 * cryptographically un-readable until the inheritance trigger fires on-chain.
 *
 * Storage uses the Walrus HTTP publisher/aggregator (the official client HTTP API; the public
 * testnet publisher subsidises storage). Verified against @mysten/seal@1.1.3, @mysten/sui@2.17.0.
 */
import "dotenv/config";
import {
  SuiJsonRpcClient,
  getJsonRpcFullnodeUrl,
  type SuiObjectChangeCreated,
} from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { fromHex, toHex } from "@mysten/sui/utils";
import { SealClient, SessionKey } from "@mysten/seal";

const NETWORK = (process.env.NETWORK ?? "testnet") as "testnet" | "mainnet";
const PACKAGE_ID = process.env.PACKAGE_ID;
const SUI_SECRET_KEY = process.env.SUI_SECRET_KEY;
const WALRUS_PUBLISHER =
  process.env.WALRUS_PUBLISHER ??
  "https://publisher.walrus-testnet.walrus.space";
const WALRUS_AGGREGATOR =
  process.env.WALRUS_AGGREGATOR ??
  "https://aggregator.walrus-testnet.walrus.space";

// Mysten independent testnet Seal key servers (public object IDs; 0x added at runtime).
const KEY_SERVER_IDS = [
  "73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75",
  "f5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8",
].map((id) => `0x${id}`);
const THRESHOLD = 2;
const LETTER =
  "My dearest Maya — everything I saved is yours. Be brave. — Grandma";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function requireEnv(): { pkg: string; key: string } {
  if (!PACKAGE_ID || !SUI_SECRET_KEY) {
    console.error(
      "Missing PACKAGE_ID / SUI_SECRET_KEY (see packages/wishes/README.md).",
    );
    process.exit(1);
  }
  return { pkg: PACKAGE_ID, key: SUI_SECRET_KEY };
}

function newSeal(suiClient: SuiJsonRpcClient): SealClient {
  return new SealClient({
    suiClient,
    serverConfigs: KEY_SERVER_IDS.map((objectId) => ({ objectId, weight: 1 })),
    verifyKeyServers: false,
  });
}

// --- Walrus HTTP API ---
interface PublisherResponse {
  newlyCreated?: { blobObject: { blobId: string } };
  alreadyCertified?: { blobId: string };
}

async function walrusPut(bytes: Uint8Array, epochs: number): Promise<string> {
  const res = await fetch(`${WALRUS_PUBLISHER}/v1/blobs?epochs=${epochs}`, {
    method: "PUT",
    body: bytes,
  });
  if (!res.ok) throw new Error(`publisher HTTP ${res.status}`);
  const j = (await res.json()) as PublisherResponse;
  const blobId =
    j.newlyCreated?.blobObject.blobId ?? j.alreadyCertified?.blobId;
  if (!blobId) throw new Error("no blobId in publisher response");
  return blobId;
}

async function walrusGet(blobId: string): Promise<Uint8Array> {
  const res = await fetch(`${WALRUS_AGGREGATOR}/v1/blobs/${blobId}`);
  if (!res.ok) throw new Error(`aggregator HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function createEstate(
  suiClient: SuiJsonRpcClient,
  keypair: Ed25519Keypair,
  pkg: string,
): Promise<string> {
  const me = keypair.toSuiAddress();
  const tx = new Transaction();
  tx.moveCall({
    target: `${pkg}::estate::create_estate`,
    arguments: [
      tx.pure.vector("address", [me]),
      tx.pure.vector("u64", [10000]),
      tx.pure.option("address", null),
      tx.pure.u64(0),
      tx.pure.u64(0),
      tx.object.clock(),
    ],
  });
  const res = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showObjectChanges: true },
  });
  await suiClient.waitForTransaction({ digest: res.digest });
  const created = res.objectChanges?.find(
    (c): c is SuiObjectChangeCreated =>
      c.type === "created" && c.objectType.endsWith("::estate::Estate"),
  );
  if (!created) throw new Error("Estate not found in object changes");
  return created.objectId;
}

async function callClockFn(
  suiClient: SuiJsonRpcClient,
  keypair: Ed25519Keypair,
  pkg: string,
  fn: "arm" | "finalize",
  estateId: string,
): Promise<void> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${pkg}::estate::${fn}`,
    arguments: [tx.object(estateId), tx.object.clock()],
  });
  const res = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
  });
  await suiClient.waitForTransaction({ digest: res.digest });
}

async function sealApproveTxBytes(
  suiClient: SuiJsonRpcClient,
  pkg: string,
  estateId: string,
  innerId: Uint8Array,
): Promise<Uint8Array> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${pkg}::estate::seal_approve`,
    arguments: [tx.pure.vector("u8", Array.from(innerId)), tx.object(estateId)],
  });
  return await tx.build({ client: suiClient, onlyTransactionKind: true });
}

async function main(): Promise<void> {
  const { pkg, key } = requireEnv();
  const suiClient = new SuiJsonRpcClient({
    url: getJsonRpcFullnodeUrl(NETWORK),
    network: NETWORK,
  });
  const keypair = Ed25519Keypair.fromSecretKey(key);
  const me = keypair.toSuiAddress();
  console.log(`signer ${me} · ${NETWORK} · package ${pkg.slice(0, 10)}…\n`);

  // 1. Estate
  const estateId = await createEstate(suiClient, keypair, pkg);
  console.log(`1. Estate created (ACTIVE): ${estateId}`);

  // 2. Seal-encrypt the letter to [estate id][nonce]
  const nonce = crypto.getRandomValues(new Uint8Array(8));
  const innerId = new Uint8Array([...fromHex(estateId), ...nonce]);
  const data = new TextEncoder().encode(LETTER);
  const { encryptedObject } = await newSeal(suiClient).encrypt({
    threshold: THRESHOLD,
    packageId: pkg,
    id: toHex(innerId),
    data,
  });
  console.log(
    `2. Encrypted ${data.length}-byte letter (Seal, threshold ${THRESHOLD})`,
  );

  // 3. Store ciphertext on Walrus
  const blobId = await walrusPut(encryptedObject, 3);
  console.log(`3. Stored on Walrus: blobId ${blobId}`);

  // 4. Session key + decrypt attempt while ACTIVE -> must FAIL
  const sessionKey = await SessionKey.create({
    address: me,
    packageId: pkg,
    ttlMin: 10,
    suiClient,
  });
  const { signature } = await keypair.signPersonalMessage(
    sessionKey.getPersonalMessage(),
  );
  await sessionKey.setPersonalMessageSignature(signature);

  console.log("4. Decrypt while ACTIVE (expect DENIED)…");
  {
    const txBytes = await sealApproveTxBytes(suiClient, pkg, estateId, innerId);
    let denied = false;
    try {
      await newSeal(suiClient).decrypt({
        data: encryptedObject,
        sessionKey,
        txBytes,
      });
    } catch (e) {
      denied = true;
      console.log(
        `   ✓ DENIED while ACTIVE (${(e as Error).constructor.name})`,
      );
    }
    if (!denied) throw new Error("FAILED: decrypted while ACTIVE");
  }

  // 5. Trigger the estate (timers are 0, so both succeed immediately)
  await callClockFn(suiClient, keypair, pkg, "arm", estateId);
  await callClockFn(suiClient, keypair, pkg, "finalize", estateId);
  console.log("5. Estate TRIGGERED (arm + finalize)");

  // 6. Fetch ciphertext back from Walrus and decrypt -> must SUCCEED
  console.log("6. Fetch from Walrus + decrypt (expect SUCCESS)…");
  const fetched = await walrusGet(blobId);
  console.log(`   read ${fetched.length} bytes back from Walrus`);
  let recovered: string | null = null;
  for (let attempt = 1; attempt <= 6 && recovered === null; attempt++) {
    try {
      const txBytes = await sealApproveTxBytes(
        suiClient,
        pkg,
        estateId,
        innerId,
      );
      const plaintext = await newSeal(suiClient).decrypt({
        data: fetched,
        sessionKey,
        txBytes,
      });
      recovered = new TextDecoder().decode(plaintext);
    } catch (e) {
      console.log(
        `   …attempt ${attempt} not ready (${(e as Error).message}); retrying`,
      );
      await sleep(3000);
    }
  }
  if (recovered !== LETTER)
    throw new Error(`FAILED: recovered ${JSON.stringify(recovered)}`);
  console.log(`   ✓ SUCCESS. Recovered: ${JSON.stringify(recovered)}`);

  console.log(
    "\n✅ LAST-WISHES PASSED — Walrus-stored letter decrypts only after the trigger.",
  );
}

main().catch((e) => {
  console.error("\n❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
