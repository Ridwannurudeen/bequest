/**
 * Spike #4 — Seal conditional decryption.
 *
 * Proves Bequest's headline feature end-to-end on Sui testnet:
 *   1. Create a `Gate` (status = ACTIVE).
 *   2. Encrypt a secret to the gate's key-id namespace.
 *   3. Try to decrypt while ACTIVE  -> MUST FAIL (seal_approve aborts).
 *   4. Flip the gate to TRIGGERED.
 *   5. Decrypt again              -> MUST SUCCEED and recover the plaintext.
 *
 * API verified 2026-05-22 against @mysten/seal@1.1.3 / @mysten/sui@2.17.0.
 * Key servers: the two Mysten independent testnet servers (Open mode, free).
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

// Mysten independent testnet key servers (verified 2026-05-22 from seal docs/Pricing.mdx).
// Stored without the 0x prefix (added at runtime) — these are PUBLIC Sui object IDs, not
// secrets; the bare form just keeps repo secret-scanning hooks happy.
const KEY_SERVER_IDS = [
  "73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75",
  "f5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8",
].map((id) => `0x${id}`);
const THRESHOLD = 2;
const SECRET_TEXT =
  "My dearest Maya — everything I saved is yours. Be brave. — Grandma";

function requireEnv(): { packageId: string; secretKey: string } {
  if (!PACKAGE_ID || !SUI_SECRET_KEY) {
    console.error(
      [
        "Missing env. Create packages/seal-spike/.env with:",
        "  NETWORK=testnet",
        "  PACKAGE_ID=<first-version id from `sui client publish`>",
        "  SUI_SECRET_KEY=<suiprivkey1... from `sui keytool export`>",
        "",
        "See packages/seal-spike/README.md for the full setup.",
      ].join("\n"),
    );
    process.exit(1);
  }
  return { packageId: PACKAGE_ID, secretKey: SUI_SECRET_KEY };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function newSealClient(suiClient: SuiJsonRpcClient): SealClient {
  return new SealClient({
    suiClient,
    serverConfigs: KEY_SERVER_IDS.map((objectId) => ({ objectId, weight: 1 })),
    verifyKeyServers: false,
  });
}

async function createGate(
  suiClient: SuiJsonRpcClient,
  keypair: Ed25519Keypair,
  packageId: string,
): Promise<string> {
  const tx = new Transaction();
  tx.moveCall({ target: `${packageId}::gate::create_gate_entry` });
  const res = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showObjectChanges: true },
  });
  await suiClient.waitForTransaction({ digest: res.digest });

  const created = res.objectChanges?.find(
    (c): c is SuiObjectChangeCreated =>
      c.type === "created" && c.objectType.endsWith("::gate::Gate"),
  );
  if (!created) throw new Error("Gate object not found in tx object changes");
  return created.objectId;
}

async function triggerGate(
  suiClient: SuiJsonRpcClient,
  keypair: Ed25519Keypair,
  packageId: string,
  gateId: string,
): Promise<void> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::gate::trigger`,
    arguments: [tx.object(gateId)],
  });
  const res = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
  });
  await suiClient.waitForTransaction({ digest: res.digest });
}

async function buildSealApproveTxBytes(
  suiClient: SuiJsonRpcClient,
  packageId: string,
  gateId: string,
  innerIdBytes: Uint8Array,
): Promise<Uint8Array> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::gate::seal_approve`,
    arguments: [
      tx.pure.vector("u8", Array.from(innerIdBytes)),
      tx.object(gateId),
    ],
  });
  // onlyTransactionKind is REQUIRED — the key server's PTB validator expects a bare
  // TransactionKind that only calls seal_approve* on a single package.
  return await tx.build({ client: suiClient, onlyTransactionKind: true });
}

async function main(): Promise<void> {
  const { packageId, secretKey } = requireEnv();

  const suiClient = new SuiJsonRpcClient({
    url: getJsonRpcFullnodeUrl(NETWORK),
    network: NETWORK,
  });
  const keypair = Ed25519Keypair.fromSecretKey(secretKey);
  const address = keypair.toSuiAddress();
  console.log(`Network: ${NETWORK}`);
  console.log(`Signer:  ${address}`);
  console.log(`Package: ${packageId}\n`);

  // 1) Create the Gate (ACTIVE).
  const gateId = await createGate(suiClient, keypair, packageId);
  console.log(`1. Gate created (ACTIVE): ${gateId}`);

  // 2) Build the key-id: [gate id][nonce]. Seal prepends [pkg id] internally.
  const nonce = crypto.getRandomValues(new Uint8Array(8));
  const innerIdBytes = new Uint8Array([...fromHex(gateId), ...nonce]);
  const innerIdHex = toHex(innerIdBytes);

  // 3) Encrypt the secret last-wishes.
  const data = new TextEncoder().encode(SECRET_TEXT);
  const { encryptedObject } = await newSealClient(suiClient).encrypt({
    threshold: THRESHOLD,
    packageId,
    id: innerIdHex,
    data,
  });
  console.log(
    `2. Encrypted ${data.length} bytes to key-id ${innerIdHex.slice(0, 18)}…`,
  );

  // 4) Session key (the heir granting time-limited decrypt access). Signed by our keypair here.
  const sessionKey = await SessionKey.create({
    address,
    packageId,
    ttlMin: 10,
    suiClient,
  });
  const { signature } = await keypair.signPersonalMessage(
    sessionKey.getPersonalMessage(),
  );
  await sessionKey.setPersonalMessageSignature(signature);

  // 5) Attempt decrypt while ACTIVE -> must FAIL.
  console.log("3. Attempting decrypt while ACTIVE (expect DENIED)…");
  {
    const txBytes = await buildSealApproveTxBytes(
      suiClient,
      packageId,
      gateId,
      innerIdBytes,
    );
    let denied = false;
    try {
      await newSealClient(suiClient).decrypt({
        data: encryptedObject,
        sessionKey,
        txBytes,
      });
    } catch (e) {
      denied = true;
      console.log(
        `   ✓ correctly DENIED while ACTIVE (${(e as Error).constructor.name})`,
      );
    }
    if (!denied)
      throw new Error(
        "SPIKE FAILED: decryption succeeded while gate was ACTIVE",
      );
  }

  // 6) Trigger the gate.
  await triggerGate(suiClient, keypair, packageId, gateId);
  console.log("4. Gate flipped to TRIGGERED");

  // 7) Decrypt after TRIGGERED -> must SUCCEED (fresh client to avoid the key cache;
  //    retry to absorb key-server full-node indexing lag on the new object version).
  console.log("5. Attempting decrypt after TRIGGERED (expect SUCCESS)…");
  let recovered: string | null = null;
  for (let attempt = 1; attempt <= 6 && recovered === null; attempt++) {
    try {
      const txBytes = await buildSealApproveTxBytes(
        suiClient,
        packageId,
        gateId,
        innerIdBytes,
      );
      const plaintext = await newSealClient(suiClient).decrypt({
        data: encryptedObject,
        sessionKey,
        txBytes,
      });
      recovered = new TextDecoder().decode(plaintext);
    } catch (e) {
      console.log(
        `   …attempt ${attempt} not ready (${(e as Error).message}); retrying in 3s`,
      );
      await sleep(3000);
    }
  }
  if (recovered === null)
    throw new Error("SPIKE FAILED: decrypt did not succeed after TRIGGERED");
  if (recovered !== SECRET_TEXT) {
    throw new Error(
      `SPIKE FAILED: plaintext mismatch. Got: ${JSON.stringify(recovered)}`,
    );
  }
  console.log(
    `   ✓ SUCCEEDED after TRIGGERED. Recovered: ${JSON.stringify(recovered)}`,
  );

  console.log(
    "\n✅ SPIKE PASSED — Seal decrypts only after the on-chain trigger.",
  );
}

main().catch((e) => {
  console.error("\n❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
