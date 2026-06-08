/**
 * No-secret live proof verifier.
 *
 * Confirms the published Sui package exists on the selected network and still exposes the
 * Bequest Move surface the web app and README claim: estate custody/dead-man distribution plus
 * Seal-gated wishes.
 */
import "dotenv/config";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";

type Network = "testnet" | "mainnet";

const NETWORK = (process.env.NETWORK ?? "testnet") as Network;
const PACKAGE_ID =
  process.env.PACKAGE_ID ??
  "0x1eb5d739100981217e4db2d5787d0f005f34efc31db8dc9369ea491fdb731272";

const EXPECTED_MODULES = ["estate", "gate"] as const;
const EXPECTED_SYMBOLS: Record<(typeof EXPECTED_MODULES)[number], string[]> = {
  estate: [
    "public create_estate(",
    "public deposit_coin<",
    "public arm(",
    "public finalize(",
    "public distribute_coin<",
    "entry seal_approve(",
  ],
  gate: [
    "public create_gate(",
    "entry create_gate_entry(",
    "public trigger(",
    "entry seal_approve(",
  ],
};

interface PackageContent {
  dataType?: string;
  disassembled?: Record<string, string>;
}

function fail(message: string): never {
  console.error(`BEQUEST_PROOF_PACKAGE_FAILED: ${message}`);
  process.exit(1);
}

function assertNetwork(value: string): asserts value is Network {
  if (value !== "testnet" && value !== "mainnet") {
    fail(`NETWORK must be testnet or mainnet, received "${value}"`);
  }
}

function verifyModule(
  disassembled: Record<string, string>,
  moduleName: (typeof EXPECTED_MODULES)[number],
): void {
  const source = disassembled[moduleName];
  if (!source) {
    fail(`missing module ${moduleName}`);
  }

  const missingSymbols = EXPECTED_SYMBOLS[moduleName].filter(
    (symbol) => !source.includes(symbol),
  );
  if (missingSymbols.length > 0) {
    fail(`${moduleName} missing symbols: ${missingSymbols.join(", ")}`);
  }
}

async function main(): Promise<void> {
  assertNetwork(NETWORK);

  const client = new SuiJsonRpcClient({
    url: getJsonRpcFullnodeUrl(NETWORK),
    network: NETWORK,
  });

  const res = await client.getObject({
    id: PACKAGE_ID,
    options: { showContent: true, showType: true },
  });

  if (res.error) {
    fail(`${res.error.code}: ${JSON.stringify(res.error)}`);
  }

  const data = res.data;
  if (!data) {
    fail(`package object not found: ${PACKAGE_ID}`);
  }
  if (data.type !== "package") {
    fail(`object is ${data.type ?? "unknown"}, expected package`);
  }

  const content = data.content as PackageContent | undefined;
  if (!content || content.dataType !== "package" || !content.disassembled) {
    fail("package content/disassembly unavailable from RPC");
  }

  for (const moduleName of EXPECTED_MODULES) {
    verifyModule(content.disassembled, moduleName);
  }

  const modules = Object.keys(content.disassembled).sort();
  console.log("BEQUEST_PROOF_PACKAGE_READY");
  console.log(`network: ${NETWORK}`);
  console.log(`package: ${PACKAGE_ID}`);
  console.log(`object_digest: ${data.digest}`);
  console.log(`version: ${data.version}`);
  console.log(`modules: ${modules.join(", ")}`);
  for (const moduleName of EXPECTED_MODULES) {
    console.log(
      `verified ${moduleName}: ${EXPECTED_SYMBOLS[moduleName].join(" | ")}`,
    );
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
