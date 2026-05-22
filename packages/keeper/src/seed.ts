/**
 * Seed a test Estate so the keeper has something to act on.
 *
 * Creates an estate with the signer as sole heir and inactivity/grace = 0, so it is immediately
 * eligible for arm + finalize — the keeper will trigger it on its next two ticks. Prints the
 * estate id. Verified against @mysten/sui@2.17.0.
 */
import "dotenv/config";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";

const NETWORK = (process.env.NETWORK ?? "testnet") as "testnet" | "mainnet";
const PACKAGE_ID = process.env.PACKAGE_ID;
const SUI_SECRET_KEY = process.env.SUI_SECRET_KEY;
const INACTIVITY_MS = Number(process.env.SEED_INACTIVITY_MS ?? 0);
const GRACE_MS = Number(process.env.SEED_GRACE_MS ?? 0);

async function main(): Promise<void> {
  if (!PACKAGE_ID || !SUI_SECRET_KEY) {
    console.error(
      "Missing env. Set PACKAGE_ID and SUI_SECRET_KEY (see packages/keeper/README.md).",
    );
    process.exit(1);
  }
  const client = new SuiJsonRpcClient({
    url: getJsonRpcFullnodeUrl(NETWORK),
    network: NETWORK,
  });
  const keypair = Ed25519Keypair.fromSecretKey(SUI_SECRET_KEY);
  const me = keypair.toSuiAddress();

  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::estate::create_estate`,
    arguments: [
      tx.pure.vector("address", [me]), // heir_addrs: sole heir = me
      tx.pure.vector("u64", [10000]), // heir_bps: 100%
      tx.pure.option("address", null), // executor: none
      tx.pure.u64(INACTIVITY_MS),
      tx.pure.u64(GRACE_MS),
      tx.object.clock(),
    ],
  });
  const res = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showObjectChanges: true },
  });
  await client.waitForTransaction({ digest: res.digest });

  const created = res.objectChanges?.find(
    (c): c is Extract<typeof c, { type: "created" }> =>
      c.type === "created" && c.objectType.endsWith("::estate::Estate"),
  );
  console.log(`seeded estate: ${created ? created.objectId : "NOT FOUND"}`);
  console.log(
    `(inactivity=${INACTIVITY_MS}ms grace=${GRACE_MS}ms) tx ${res.digest}`,
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
