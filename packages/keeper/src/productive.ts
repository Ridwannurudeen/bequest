/**
 * Productive estate (#55): make the escrow EARN YIELD while held, with zero new Move code.
 *
 * A `StakedSui` is a `key + store` object that auto-compounds via the staking pool's exchange rate
 * (no claim step), so the estate "grows while held" just by holding it. We stake off-chain in one PTB
 * and `deposit_object<StakedSui>` it into an ACTIVE estate — the contract is unchanged.
 *
 *   1. create an ACTIVE estate (sole heir = signer, long timers so it stays ACTIVE)
 *   2. one PTB: split STAKE_MIST from gas -> request_add_stake_non_entry(0x5, coin, validator)
 *      -> deposit_object<0x3::staking_pool::StakedSui>(estate, staked, heir, clock)
 *   3. read the estate back and confirm the StakedSui position is escrowed
 *
 * On trigger, `distribute_object<StakedSui>` pushes the position to the heir, who redeems it via
 * `0x3::sui_system::request_withdraw_stake` (principal + accrued rewards). The bps-splittable
 * mainnet design is the same flow with an LST `Coin<T>` through deposit_coin/distribute_coin.
 * Verified against @mysten/sui@2.17.0; native staking confirmed live on testnet.
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
const STAKE_MIST = Number(process.env.STAKE_MIST ?? 1_000_000_000); // 1 SUI (network minimum)
const STAKED_SUI_TYPE = "0x3::staking_pool::StakedSui";
const SYSTEM_STATE = "0x5";

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

  const validator = (await client.getLatestSuiSystemState()).activeValidators[0]
    .suiAddress;
  console.log(
    `signer ${me} · ${NETWORK} · validator ${validator.slice(0, 10)}…`,
  );

  // 1. ACTIVE estate, sole heir = signer, 1y inactivity / 1d grace (stays ACTIVE for the demo).
  const createTx = new Transaction();
  createTx.moveCall({
    target: `${PACKAGE_ID}::estate::create_estate`,
    arguments: [
      createTx.pure.vector("address", [me]),
      createTx.pure.vector("u64", [10000]),
      createTx.pure.option("address", null),
      createTx.pure.u64(365 * 24 * 60 * 60 * 1000),
      createTx.pure.u64(24 * 60 * 60 * 1000),
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
  if (!created) throw new Error("Estate not found in object changes");
  const estateId = created.objectId;
  console.log(`1. estate (ACTIVE): ${estateId}`);

  // 2. Stake SUI and escrow the resulting StakedSui position, in one PTB.
  const tx = new Transaction();
  const [stakeCoin] = tx.splitCoins(tx.gas, [STAKE_MIST]);
  const [staked] = tx.moveCall({
    target: "0x3::sui_system::request_add_stake_non_entry",
    arguments: [tx.object(SYSTEM_STATE), stakeCoin, tx.pure.address(validator)],
  });
  tx.moveCall({
    target: `${PACKAGE_ID}::estate::deposit_object`,
    typeArguments: [STAKED_SUI_TYPE],
    arguments: [
      tx.object(estateId),
      staked,
      tx.pure.address(me),
      tx.object.clock(),
    ],
  });
  const res = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
  });
  await client.waitForTransaction({ digest: res.digest });
  console.log(
    `2. staked ${STAKE_MIST / 1e9} SUI -> StakedSui escrowed (tx ${res.digest})`,
  );

  // 3. Confirm the position is held in the estate's ObjectBag.
  const obj = await client.getObject({
    id: estateId,
    options: { showContent: true },
  });
  const fields =
    obj.data?.content?.dataType === "moveObject"
      ? (obj.data.content.fields as {
          objects?: { fields?: { id?: { id?: string }; size?: string } };
        })
      : undefined;
  console.log(
    `3. escrowed object count: ${fields?.objects?.fields?.size ?? "?"} (1 = the StakedSui position)`,
  );
  console.log(
    `productive estate ready: ${estateId} — it compounds while held; distribute on trigger.`,
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
