import { NextResponse } from "next/server";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { getPublicConfig } from "../../../../lib/config";
import { resolvedPackageId } from "../../../../lib/claim-receipt";

const ADDRESS = /^0x[0-9a-fA-F]{64}$/;

type OwnerAction =
  | "create"
  | "create_scheduled"
  | "heartbeat"
  | "update_heirs"
  | "update_executor"
  | "update_timers"
  | "withdraw_coin"
  | "withdraw_object"
  | "set_wishes"
  | "set_guardians"
  | "propose_recovery"
  | "approve_recovery"
  | "cancel_recovery";

type Body = {
  action?: OwnerAction;
  estateId?: string;
  sender?: string;
  heirs?: string[];
  bps?: number[];
  inactivityMs?: number;
  graceMs?: number;
  executor?: string;
  releaseAtMs?: number;
  amount?: string | number;
  coinType?: string;
  objectId?: string;
  objectType?: string;
  blobId?: string;
  keyIdHex?: string;
  digestHex?: string;
  guardians?: string[];
  threshold?: number;
  newOwner?: string;
};

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

// Heir address + bps validation shared by create / create_scheduled / update_heirs.
function heirError(heirs: string[], bps: number[]): string | null {
  if (heirs.length === 0 || heirs.length !== bps.length)
    return "Provide at least one heir, with one share per heir.";
  if (!heirs.every((h) => ADDRESS.test(h)))
    return "Each heir must be a 32-byte Sui address (0x…).";
  if (!bps.every((b) => Number.isInteger(b) && b > 0))
    return "Each share must be a positive whole number of basis points.";
  if (bps.reduce((a, b) => a + b, 0) !== 10000)
    return "Shares must sum to 100% (10000 basis points).";
  return null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const config = getPublicConfig();
    const pkg = resolvedPackageId(config);
    const target = (fn: string) => `${pkg}::${config.estateModule}::${fn}`;
    const action: OwnerAction = body.action ?? "create";

    const heirs = body.heirs ?? [];
    const bps = body.bps ?? [];
    const executor = body.executor?.trim() || null;
    if (executor && !ADDRESS.test(executor))
      return bad("Executor must be a 32-byte Sui address (0x…).");

    const estateId = body.estateId;
    const needsEstate = action !== "create" && action !== "create_scheduled";
    if (needsEstate && (!estateId || !ADDRESS.test(estateId)))
      return bad("estateId must be a 32-byte Sui object id.");

    const tx = new Transaction();
    if (body.sender && ADDRESS.test(body.sender))
      tx.setSenderIfNotSet(body.sender);

    switch (action) {
      case "create": {
        const err = heirError(heirs, bps);
        if (err) return bad(err);
        tx.moveCall({
          target: target("create_estate"),
          arguments: [
            tx.pure.vector("address", heirs),
            tx.pure.vector("u64", bps),
            tx.pure.option("address", executor),
            tx.pure.u64(Math.max(0, Math.floor(body.inactivityMs ?? 0))),
            tx.pure.u64(Math.max(0, Math.floor(body.graceMs ?? 0))),
            tx.object.clock(),
          ],
        });
        break;
      }
      case "create_scheduled": {
        const err = heirError(heirs, bps);
        if (err) return bad(err);
        const releaseAtMs = Math.floor(body.releaseAtMs ?? 0);
        if (releaseAtMs <= Date.now())
          return bad("Scheduled release time must be in the future.");
        tx.moveCall({
          target: target("create_scheduled_estate"),
          arguments: [
            tx.pure.vector("address", heirs),
            tx.pure.vector("u64", bps),
            tx.pure.option("address", executor),
            tx.pure.u64(releaseAtMs),
            tx.object.clock(),
          ],
        });
        break;
      }
      case "heartbeat":
        tx.moveCall({
          target: target("heartbeat"),
          arguments: [tx.object(estateId!), tx.object.clock()],
        });
        break;
      case "update_heirs": {
        const err = heirError(heirs, bps);
        if (err) return bad(err);
        tx.moveCall({
          target: target("update_heirs"),
          arguments: [
            tx.object(estateId!),
            tx.pure.vector("address", heirs),
            tx.pure.vector("u64", bps),
            tx.object.clock(),
          ],
        });
        break;
      }
      case "update_executor":
        tx.moveCall({
          target: target("update_executor"),
          arguments: [
            tx.object(estateId!),
            tx.pure.option("address", executor),
            tx.object.clock(),
          ],
        });
        break;
      case "update_timers":
        tx.moveCall({
          target: target("update_timers"),
          arguments: [
            tx.object(estateId!),
            tx.pure.u64(Math.max(0, Math.floor(body.inactivityMs ?? 0))),
            tx.pure.u64(Math.max(0, Math.floor(body.graceMs ?? 0))),
            tx.object.clock(),
          ],
        });
        break;
      case "withdraw_coin": {
        if (!body.sender || !ADDRESS.test(body.sender))
          return bad("sender is required to receive the withdrawn coin.");
        if (!body.coinType)
          return bad("coinType is required for withdraw_coin.");
        let amount: bigint;
        try {
          amount = BigInt(body.amount ?? 0);
        } catch {
          return bad("amount must be an integer number of base units.");
        }
        if (amount <= BigInt(0)) return bad("amount must be greater than 0.");
        const [coin] = tx.moveCall({
          target: target("withdraw_coin"),
          typeArguments: [body.coinType],
          arguments: [
            tx.object(estateId!),
            tx.pure.u64(amount),
            tx.object.clock(),
          ],
        });
        tx.transferObjects([coin], tx.pure.address(body.sender));
        break;
      }
      case "withdraw_object": {
        if (!body.sender || !ADDRESS.test(body.sender))
          return bad("sender is required to receive the withdrawn object.");
        if (!body.objectType)
          return bad("objectType is required for withdraw_object.");
        if (!body.objectId || !ADDRESS.test(body.objectId))
          return bad("objectId must be a 32-byte Sui object id.");
        const [obj] = tx.moveCall({
          target: target("withdraw_object"),
          typeArguments: [body.objectType],
          arguments: [
            tx.object(estateId!),
            tx.pure.id(body.objectId),
            tx.object.clock(),
          ],
        });
        tx.transferObjects([obj], tx.pure.address(body.sender));
        break;
      }
      case "set_wishes": {
        const blobId =
          typeof body.blobId === "string" ? body.blobId.trim() : "";
        const keyIdHex = (body.keyIdHex ?? "").replace(/^0x/, "");
        const digestHex = (body.digestHex ?? "").replace(/^0x/, "");
        if (!blobId) return bad("blobId is required for set_wishes.");
        if (!/^[0-9a-fA-F]+$/.test(keyIdHex))
          return bad("keyIdHex must be hex (the Seal key id).");
        if (!/^[0-9a-fA-F]*$/.test(digestHex))
          return bad("digestHex must be hex.");
        tx.moveCall({
          target: target("set_wishes"),
          arguments: [
            tx.object(estateId!),
            tx.pure.vector("u8", Array.from(Buffer.from(blobId, "utf8"))),
            tx.pure.vector("u8", Array.from(Buffer.from(keyIdHex, "hex"))),
            tx.pure.vector("u8", Array.from(Buffer.from(digestHex, "hex"))),
            tx.object.clock(),
          ],
        });
        break;
      }
      case "set_guardians": {
        const guardians = body.guardians ?? [];
        if (guardians.length === 0)
          return bad("Provide at least one guardian address.");
        if (!guardians.every((g) => ADDRESS.test(g)))
          return bad("Each guardian must be a 32-byte Sui address (0x…).");
        const threshold = Math.floor(body.threshold ?? 0);
        if (threshold < 1 || threshold > guardians.length)
          return bad(
            "Threshold must be between 1 and the number of guardians.",
          );
        tx.moveCall({
          target: target("set_guardians"),
          arguments: [
            tx.object(estateId!),
            tx.pure.vector("address", guardians),
            tx.pure.u64(threshold),
            tx.object.clock(),
          ],
        });
        break;
      }
      case "propose_recovery": {
        const newOwner = body.newOwner?.trim();
        if (!newOwner || !ADDRESS.test(newOwner))
          return bad("newOwner must be a 32-byte Sui address (0x…).");
        tx.moveCall({
          target: target("propose_recovery"),
          arguments: [tx.object(estateId!), tx.pure.address(newOwner)],
        });
        break;
      }
      case "approve_recovery":
        tx.moveCall({
          target: target("approve_recovery"),
          arguments: [tx.object(estateId!)],
        });
        break;
      case "cancel_recovery":
        tx.moveCall({
          target: target("cancel_recovery"),
          arguments: [tx.object(estateId!)],
        });
        break;
      default:
        return bad(`Unknown owner action: ${String(action)}`);
    }

    const bytes = await tx.build({
      client: new SuiJsonRpcClient({
        url: getJsonRpcFullnodeUrl(config.network),
        network: config.network,
      }),
      onlyTransactionKind: true,
    });

    return NextResponse.json({
      network: config.network,
      packageId: pkg,
      action,
      transactionBlockKindBytes: Buffer.from(bytes).toString("base64"),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown owner transaction build error",
      },
      { status: 500 },
    );
  }
}
