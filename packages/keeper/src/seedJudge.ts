/**
 * Seed the canonical "judge estate" (#57): a funded, 2-heir (70/30) estate the demo links as the
 * claim target. Creates the estate, then deposits SUI into it (one tx each, since the estate is a
 * shared object only after create). Leaves it ACTIVE so heirs can still be finalized via
 * `update_heirs` — set the real heir (e.g. the heir's zkLogin address) before arming/triggering.
 *
 * Env:
 *   PACKAGE_ID, SUI_SECRET_KEY            (required; deployer/funder key)
 *   JUDGE_HEIRS   comma-separated addresses (default: signer twice is invalid — must be 2 distinct)
 *   JUDGE_BPS     comma-separated bps summing to 10000 (default 7000,3000)
 *   JUDGE_DEPOSIT_MIST  SUI to escrow, in MIST (default 20000000 = 0.02 SUI)
 *   JUDGE_INACTIVITY_MS / JUDGE_GRACE_MS  timers (default 1 year / 1 day — stays ACTIVE)
 *
 * Verified against @mysten/sui@2.17.0.
 */
import "dotenv/config";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";

const NETWORK = (process.env.NETWORK ?? "testnet") as "testnet" | "mainnet";
const PACKAGE_ID = process.env.PACKAGE_ID;
const SUI_SECRET_KEY = process.env.SUI_SECRET_KEY;
const HEIRS = (process.env.JUDGE_HEIRS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const BPS = (process.env.JUDGE_BPS ?? "7000,3000")
  .split(",")
  .map((s) => Number(s.trim()));
const DEPOSIT_MIST = Number(process.env.JUDGE_DEPOSIT_MIST ?? 20000000);
const INACTIVITY_MS = Number(
  process.env.JUDGE_INACTIVITY_MS ?? 365 * 24 * 60 * 60 * 1000,
);
const GRACE_MS = Number(process.env.JUDGE_GRACE_MS ?? 24 * 60 * 60 * 1000);

async function main(): Promise<void> {
  if (!PACKAGE_ID || !SUI_SECRET_KEY) {
    console.error(
      "Missing env. Set PACKAGE_ID and SUI_SECRET_KEY (see packages/keeper/README.md).",
    );
    process.exit(1);
  }
  if (HEIRS.length < 2 || HEIRS.length !== BPS.length) {
    console.error(
      "Set JUDGE_HEIRS (>=2 addresses) and matching JUDGE_BPS summing to 10000.",
    );
    process.exit(1);
  }
  if (BPS.reduce((a, b) => a + b, 0) !== 10000) {
    console.error(`JUDGE_BPS must sum to 10000 (got ${BPS.join("+")}).`);
    process.exit(1);
  }

  const client = new SuiJsonRpcClient({
    url: getJsonRpcFullnodeUrl(NETWORK),
    network: NETWORK,
  });
  const keypair = Ed25519Keypair.fromSecretKey(SUI_SECRET_KEY);

  const createTx = new Transaction();
  createTx.moveCall({
    target: `${PACKAGE_ID}::estate::create_estate`,
    arguments: [
      createTx.pure.vector("address", HEIRS),
      createTx.pure.vector("u64", BPS),
      createTx.pure.option("address", null),
      createTx.pure.u64(INACTIVITY_MS),
      createTx.pure.u64(GRACE_MS),
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
    (c): c is Extract<typeof c, { type: "created" }> =>
      c.type === "created" && c.objectType.endsWith("::estate::Estate"),
  );
  if (!created) throw new Error("Estate not found in objectChanges");
  const estateId = created.objectId;
  console.log(
    `judge estate: ${estateId} (heirs ${HEIRS.map((h, i) => `${h}=${BPS[i]}bps`).join(", ")})`,
  );

  const depositTx = new Transaction();
  const [coin] = depositTx.splitCoins(depositTx.gas, [DEPOSIT_MIST]);
  depositTx.moveCall({
    target: `${PACKAGE_ID}::estate::deposit_coin`,
    typeArguments: ["0x2::sui::SUI"],
    arguments: [depositTx.object(estateId), coin, depositTx.object.clock()],
  });
  const depRes = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: depositTx,
  });
  await client.waitForTransaction({ digest: depRes.digest });
  console.log(`deposited ${DEPOSIT_MIST / 1e9} SUI (tx ${depRes.digest})`);
  console.log(
    "estate is ACTIVE; set the final heir via update_heirs, set_wishes for the letter, then arm/finalize to TRIGGER.",
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
