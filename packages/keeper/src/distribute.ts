/**
 * Live distribution demo: create a 2-heir estate (70/30), deposit SUI, trigger, distribute, and
 * verify each heir received the correct ratio on-chain. Proves spike #3's `distribute_coin<T>` for
 * real on testnet (the full lifecycle create -> deposit -> trigger -> distribute).
 */
import "dotenv/config";
import {
  SuiJsonRpcClient,
  getJsonRpcFullnodeUrl,
  type SuiObjectChangeCreated,
} from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";

const NETWORK = (process.env.NETWORK ?? "testnet") as "testnet" | "mainnet";
const PACKAGE_ID = process.env.PACKAGE_ID;
const SUI_SECRET_KEY = process.env.SUI_SECRET_KEY;
const SUI_TYPE = "0x2::sui::SUI";
const DEPOSIT = 100_000_000; // 0.1 SUI

async function balance(
  client: SuiJsonRpcClient,
  owner: string,
): Promise<number> {
  const b = await client.getBalance({ owner, coinType: SUI_TYPE });
  return Number(b.totalBalance);
}

async function main(): Promise<void> {
  if (!PACKAGE_ID || !SUI_SECRET_KEY) {
    console.error("Missing PACKAGE_ID / SUI_SECRET_KEY.");
    process.exit(1);
  }
  const client = new SuiJsonRpcClient({
    url: getJsonRpcFullnodeUrl(NETWORK),
    network: NETWORK,
  });
  const keypair = Ed25519Keypair.fromSecretKey(SUI_SECRET_KEY);
  const pkg = PACKAGE_ID;

  const h1 = Ed25519Keypair.generate().toSuiAddress();
  const h2 = Ed25519Keypair.generate().toSuiAddress();
  console.log(`heirs: ${h1.slice(0, 10)}… (70%)  ${h2.slice(0, 10)}… (30%)\n`);

  // 1. create estate (70/30, timers 0)
  const createTx = new Transaction();
  createTx.moveCall({
    target: `${pkg}::estate::create_estate`,
    arguments: [
      createTx.pure.vector("address", [h1, h2]),
      createTx.pure.vector("u64", [7000, 3000]),
      createTx.pure.option("address", null),
      createTx.pure.u64(0),
      createTx.pure.u64(0),
      createTx.object.clock(),
    ],
  });
  const createRes = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: createTx,
    options: { showObjectChanges: true },
  });
  await client.waitForTransaction({ digest: createRes.digest });
  const created = createRes.objectChanges?.find(
    (c): c is SuiObjectChangeCreated =>
      c.type === "created" && c.objectType.endsWith("::estate::Estate"),
  );
  if (!created) throw new Error("Estate not created");
  const estateId = created.objectId;
  console.log(`1. estate ${estateId.slice(0, 12)}…`);

  // 2. deposit 0.1 SUI
  const depTx = new Transaction();
  const [coin] = depTx.splitCoins(depTx.gas, [DEPOSIT]);
  depTx.moveCall({
    target: `${pkg}::estate::deposit_coin`,
    typeArguments: [SUI_TYPE],
    arguments: [depTx.object(estateId), coin, depTx.object.clock()],
  });
  await client.waitForTransaction({
    digest: (
      await client.signAndExecuteTransaction({
        signer: keypair,
        transaction: depTx,
      })
    ).digest,
  });
  console.log(`2. deposited ${DEPOSIT} MIST`);

  // 3. arm + finalize + distribute in one PTB
  const distTx = new Transaction();
  distTx.moveCall({
    target: `${pkg}::estate::arm`,
    arguments: [distTx.object(estateId), distTx.object.clock()],
  });
  distTx.moveCall({
    target: `${pkg}::estate::finalize`,
    arguments: [distTx.object(estateId), distTx.object.clock()],
  });
  distTx.moveCall({
    target: `${pkg}::estate::distribute_coin`,
    typeArguments: [SUI_TYPE],
    arguments: [distTx.object(estateId)],
  });
  const distRes = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: distTx,
  });
  await client.waitForTransaction({ digest: distRes.digest });
  console.log(`3. armed + finalized + distributed (tx ${distRes.digest})`);

  // 4. verify each heir's balance
  const b1 = await balance(client, h1);
  const b2 = await balance(client, h2);
  const want1 = Math.floor((DEPOSIT * 7000) / 10000);
  const want2 = DEPOSIT - want1; // last heir gets the remainder
  console.log(
    `4. heir1 balance ${b1} (want ${want1}); heir2 balance ${b2} (want ${want2})`,
  );
  if (b1 !== want1 || b2 !== want2) throw new Error("FAILED: ratios incorrect");

  console.log(
    "\n✅ DISTRIBUTION PASSED — 70/30 split delivered to heirs on testnet.",
  );
}

main().catch((e) => {
  console.error("\n❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
