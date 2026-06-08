import {
  SuiJsonRpcClient,
  getJsonRpcFullnodeUrl
} from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";

const DEFAULT_PACKAGE_ID =
  "0x1eb5d739100981217e4db2d5787d0f005f34efc31db8dc9369ea491fdb731272";
const SUI_COIN_TYPE = "0x2::sui::SUI";
const OBJECT_ID_PATTERN = /^0x[0-9a-fA-F]{64}$/;

const network = process.env.NEXT_PUBLIC_SUI_NETWORK ?? "testnet";
const packageId =
  process.env.NEXT_PUBLIC_BEQUEST_PACKAGE_ID?.trim() || DEFAULT_PACKAGE_ID;
const estateModule =
  process.env.NEXT_PUBLIC_BEQUEST_ESTATE_MODULE?.trim() || "estate";
const claimTarget =
  process.env.NEXT_PUBLIC_BEQUEST_CLAIM_TARGET?.trim() ||
  `${packageId}::${estateModule}::distribute_coin`;
const typeArguments = process.env.NEXT_PUBLIC_BEQUEST_CLAIM_TARGET
  ? []
  : [SUI_COIN_TYPE];

function fail(message) {
  console.error(`BEQUEST_CLAIM_KIND_FAILED: ${message}`);
  process.exit(1);
}

async function findEstateId(client) {
  if (process.env.ESTATE_ID) return process.env.ESTATE_ID.trim();

  const page = await client.queryEvents({
    query: { MoveEventType: `${packageId}::estate::EstateCreated` },
    limit: 1,
    order: "descending"
  });

  const estate = page.data[0]?.parsedJson?.estate;
  if (typeof estate !== "string") {
    fail(`no EstateCreated events found for ${packageId}`);
  }
  return estate;
}

async function main() {
  if (!["testnet", "mainnet", "devnet"].includes(network)) {
    fail(`unsupported network "${network}"`);
  }

  const client = new SuiJsonRpcClient({
    url: getJsonRpcFullnodeUrl(network),
    network
  });

  const estateId = await findEstateId(client);
  if (!OBJECT_ID_PATTERN.test(estateId)) {
    fail(`invalid estate id "${estateId}"`);
  }

  const estate = await client.getObject({
    id: estateId,
    options: { showType: true }
  });
  if (estate.error) {
    fail(`${estate.error.code}: ${JSON.stringify(estate.error)}`);
  }

  const tx = new Transaction();
  tx.moveCall({
    target: claimTarget,
    typeArguments,
    arguments: [tx.object(estateId)]
  });

  const bytes = await tx.build({ client, onlyTransactionKind: true });
  const encoded = Buffer.from(bytes).toString("base64");

  console.log("BEQUEST_CLAIM_KIND_READY");
  console.log(`network: ${network}`);
  console.log(`package: ${packageId}`);
  console.log(`estate: ${estateId}`);
  console.log(`estate_type: ${estate.data?.type ?? "unknown"}`);
  console.log(`target: ${claimTarget}`);
  console.log(`type_arguments: ${typeArguments.join(", ") || "none"}`);
  console.log(`transaction_kind_bytes_base64_length: ${encoded.length}`);
  console.log(`transaction_kind_bytes_base64_prefix: ${encoded.slice(0, 80)}...`);
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
