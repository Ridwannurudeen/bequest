/**
 * V2 full-portfolio validation gate.
 *
 * Creates a live testnet estate, escrows liquid SUI plus a native StakedSui object and,
 * optionally, one caller-owned key+store object, then triggers and distributes the bundle.
 *
 * Required env:
 *   NETWORK=testnet
 *   PACKAGE_ID=0x...
 *   SUI_SECRET_KEY=suiprivkey1...
 *
 * Optional env:
 *   BUNDLE_STAKE_MIST=1000000000        # default 1 SUI
 *   BUNDLE_DEPOSIT_MIST=100000000       # default 0.1 SUI
 *   BUNDLE_NFT_OBJECT_ID=0x...          # optional caller-owned object earmarked to heir B
 *   BUNDLE_REQUIRE_NFT=1                # fail if BUNDLE_NFT_OBJECT_ID is absent
 */
import "dotenv/config";
import {
  SuiJsonRpcClient,
  getJsonRpcFullnodeUrl,
  type SuiObjectChangeCreated,
} from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { SUI_SYSTEM_STATE_OBJECT_ID } from "@mysten/sui/utils";

const NETWORK = (process.env.NETWORK ?? "testnet") as "testnet" | "mainnet";
const PACKAGE_ID = process.env.PACKAGE_ID;
const SUI_SECRET_KEY = process.env.SUI_SECRET_KEY;
const SUI_TYPE = "0x2::sui::SUI";
const STAKE_MIST = numberEnv("BUNDLE_STAKE_MIST", 1_000_000_000);
const DEPOSIT_MIST = numberEnv("BUNDLE_DEPOSIT_MIST", 100_000_000);
const NFT_OBJECT_ID = optional(process.env.BUNDLE_NFT_OBJECT_ID);
const REQUIRE_NFT = process.env.BUNDLE_REQUIRE_NFT === "1";

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive safe integer`);
  }
  return value;
}

function requireEnv(): { pkg: string; key: string } {
  if (!PACKAGE_ID || !SUI_SECRET_KEY) {
    throw new Error("Missing PACKAGE_ID / SUI_SECRET_KEY");
  }
  if (REQUIRE_NFT && !NFT_OBJECT_ID) {
    throw new Error("BUNDLE_REQUIRE_NFT=1 but BUNDLE_NFT_OBJECT_ID is missing");
  }
  return { pkg: PACKAGE_ID, key: SUI_SECRET_KEY };
}

function short(id: string): string {
  return `${id.slice(0, 10)}…${id.slice(-6)}`;
}

function isCreatedStake(
  change: unknown,
): change is SuiObjectChangeCreated & { objectType: string } {
  const c = change as Partial<SuiObjectChangeCreated> & {
    objectType?: string;
  };
  return (
    c.type === "created" &&
    typeof c.objectType === "string" &&
    c.objectType.endsWith("::staking_pool::StakedSui")
  );
}

async function wait(client: SuiJsonRpcClient, digest: string): Promise<void> {
  await client.waitForTransaction({ digest });
}

async function objectType(
  client: SuiJsonRpcClient,
  objectId: string,
): Promise<string> {
  const res = await client.getObject({
    id: objectId,
    options: { showType: true },
  });
  const type = res.data?.type;
  if (!type) throw new Error(`Could not read object type for ${objectId}`);
  return type;
}

async function addressOwner(
  client: SuiJsonRpcClient,
  objectId: string,
): Promise<string | null> {
  const res = await client.getObject({
    id: objectId,
    options: { showOwner: true },
  });
  const owner = res.data?.owner;
  if (typeof owner === "object" && owner && "AddressOwner" in owner) {
    return String(owner.AddressOwner);
  }
  return null;
}

async function balance(
  client: SuiJsonRpcClient,
  owner: string,
): Promise<number> {
  const b = await client.getBalance({ owner, coinType: SUI_TYPE });
  return Number(b.totalBalance);
}

async function firstActiveValidator(client: SuiJsonRpcClient): Promise<string> {
  const state = await client.getLatestSuiSystemState();
  const validator = state.activeValidators[0]?.suiAddress;
  if (!validator) throw new Error("No active validator found");
  return validator;
}

async function requestStake(
  client: SuiJsonRpcClient,
  keypair: Ed25519Keypair,
): Promise<{ digest: string; objectId: string; objectType: string }> {
  const validator = await firstActiveValidator(client);
  const tx = new Transaction();
  const [stakeCoin] = tx.splitCoins(tx.gas, [STAKE_MIST]);
  tx.moveCall({
    target: "0x3::sui_system::request_add_stake",
    arguments: [
      tx.object(SUI_SYSTEM_STATE_OBJECT_ID),
      stakeCoin,
      tx.pure.address(validator),
    ],
  });
  const res = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showObjectChanges: true },
  });
  await wait(client, res.digest);
  const created = res.objectChanges?.find(isCreatedStake);
  if (!created) {
    throw new Error("Stake transaction succeeded but no StakedSui object was created");
  }
  return {
    digest: res.digest,
    objectId: created.objectId,
    objectType: created.objectType,
  };
}

async function createEstate(
  client: SuiJsonRpcClient,
  keypair: Ed25519Keypair,
  pkg: string,
  h1: string,
  h2: string,
): Promise<{ digest: string; estateId: string }> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${pkg}::estate::create_estate`,
    arguments: [
      tx.pure.vector("address", [h1, h2]),
      tx.pure.vector("u64", [7000, 3000]),
      tx.pure.option("address", null),
      tx.pure.u64(0),
      tx.pure.u64(0),
      tx.object.clock(),
    ],
  });
  const res = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showObjectChanges: true },
  });
  await wait(client, res.digest);
  const created = res.objectChanges?.find(
    (change): change is SuiObjectChangeCreated =>
      change.type === "created" && change.objectType.endsWith("::estate::Estate"),
  );
  if (!created) throw new Error("Estate not created");
  return { digest: res.digest, estateId: created.objectId };
}

async function depositBundle(
  client: SuiJsonRpcClient,
  keypair: Ed25519Keypair,
  pkg: string,
  estateId: string,
  stakedSui: { objectId: string; objectType: string },
  h1: string,
  h2: string,
): Promise<{ digest: string; nftType?: string }> {
  const tx = new Transaction();
  const [depositCoin] = tx.splitCoins(tx.gas, [DEPOSIT_MIST]);
  tx.moveCall({
    target: `${pkg}::estate::deposit_coin`,
    typeArguments: [SUI_TYPE],
    arguments: [tx.object(estateId), depositCoin, tx.object.clock()],
  });
  tx.moveCall({
    target: `${pkg}::estate::deposit_object`,
    typeArguments: [stakedSui.objectType],
    arguments: [
      tx.object(estateId),
      tx.object(stakedSui.objectId),
      tx.pure.address(h1),
      tx.object.clock(),
    ],
  });

  let nftType: string | undefined;
  if (NFT_OBJECT_ID) {
    nftType = await objectType(client, NFT_OBJECT_ID);
    tx.moveCall({
      target: `${pkg}::estate::deposit_object`,
      typeArguments: [nftType],
      arguments: [
        tx.object(estateId),
        tx.object(NFT_OBJECT_ID),
        tx.pure.address(h2),
        tx.object.clock(),
      ],
    });
  }

  const res = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
  });
  await wait(client, res.digest);
  return { digest: res.digest, nftType };
}

async function triggerAndDistribute(
  client: SuiJsonRpcClient,
  keypair: Ed25519Keypair,
  pkg: string,
  estateId: string,
  stakedSui: { objectId: string; objectType: string },
  nftType?: string,
): Promise<string> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${pkg}::estate::arm`,
    arguments: [tx.object(estateId), tx.object.clock()],
  });
  tx.moveCall({
    target: `${pkg}::estate::finalize`,
    arguments: [tx.object(estateId), tx.object.clock()],
  });
  tx.moveCall({
    target: `${pkg}::estate::distribute_coin`,
    typeArguments: [SUI_TYPE],
    arguments: [tx.object(estateId)],
  });
  tx.moveCall({
    target: `${pkg}::estate::distribute_objects`,
    typeArguments: [stakedSui.objectType],
    arguments: [tx.object(estateId), tx.pure.vector("id", [stakedSui.objectId])],
  });
  if (NFT_OBJECT_ID && nftType) {
    tx.moveCall({
      target: `${pkg}::estate::distribute_objects`,
      typeArguments: [nftType],
      arguments: [tx.object(estateId), tx.pure.vector("id", [NFT_OBJECT_ID])],
    });
  }
  const res = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
  });
  await wait(client, res.digest);
  return res.digest;
}

async function main(): Promise<void> {
  const { pkg, key } = requireEnv();
  const client = new SuiJsonRpcClient({
    url: getJsonRpcFullnodeUrl(NETWORK),
    network: NETWORK,
  });
  const keypair = Ed25519Keypair.fromSecretKey(key);
  const h1 = Ed25519Keypair.generate().toSuiAddress();
  const h2 = Ed25519Keypair.generate().toSuiAddress();

  console.log(`owner: ${keypair.toSuiAddress()}`);
  console.log(`heir A: ${h1} (70%, SUI + StakedSui)`);
  console.log(`heir B: ${h2} (30%, optional object)`);

  const stake = await requestStake(client, keypair);
  console.log(`1. staked ${STAKE_MIST} MIST -> ${short(stake.objectId)} (${stake.digest})`);

  const estate = await createEstate(client, keypair, pkg, h1, h2);
  console.log(`2. estate ${short(estate.estateId)} (${estate.digest})`);

  const deposit = await depositBundle(client, keypair, pkg, estate.estateId, stake, h1, h2);
  console.log(`3. deposited SUI + StakedSui${NFT_OBJECT_ID ? " + object" : ""} (${deposit.digest})`);

  const distributeDigest = await triggerAndDistribute(
    client,
    keypair,
    pkg,
    estate.estateId,
    stake,
    deposit.nftType,
  );
  console.log(`4. triggered + distributed (${distributeDigest})`);

  const h1Balance = await balance(client, h1);
  const h2Balance = await balance(client, h2);
  const wantH1 = Math.floor((DEPOSIT_MIST * 7000) / 10000);
  const wantH2 = DEPOSIT_MIST - wantH1;
  const stakeOwner = await addressOwner(client, stake.objectId);
  const nftOwner = NFT_OBJECT_ID ? await addressOwner(client, NFT_OBJECT_ID) : null;

  if (h1Balance !== wantH1 || h2Balance !== wantH2) {
    throw new Error(`SUI split mismatch: got ${h1Balance}/${h2Balance}, want ${wantH1}/${wantH2}`);
  }
  if (stakeOwner?.toLowerCase() !== h1.toLowerCase()) {
    throw new Error(`StakedSui owner mismatch: got ${stakeOwner}, want ${h1}`);
  }
  if (NFT_OBJECT_ID && nftOwner?.toLowerCase() !== h2.toLowerCase()) {
    throw new Error(`Object owner mismatch: got ${nftOwner}, want ${h2}`);
  }

  const marker = NFT_OBJECT_ID
    ? "BEQUEST_FULL_PORTFOLIO_PASSED"
    : "BEQUEST_YIELD_BUNDLE_PASSED";
  console.log(`\n${marker}`);
  console.log(
    JSON.stringify(
      {
        network: NETWORK,
        packageId: pkg,
        estateId: estate.estateId,
        stakeDigest: stake.digest,
        createDigest: estate.digest,
        depositDigest: deposit.digest,
        distributeDigest,
        heirs: { h1, h2 },
        assets: {
          liquidSuiMist: DEPOSIT_MIST,
          stakedSuiObjectId: stake.objectId,
          stakedSuiType: stake.objectType,
          optionalObjectId: NFT_OBJECT_ID ?? null,
          optionalObjectType: deposit.nftType ?? null,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("\nBEQUEST_FULL_PORTFOLIO_FAILED");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
