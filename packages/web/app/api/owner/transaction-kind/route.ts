import { NextResponse } from "next/server";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { getPublicConfig } from "../../../../lib/config";
import { resolvedPackageId } from "../../../../lib/claim-receipt";

const ADDRESS = /^0x[0-9a-fA-F]{64}$/;

// Builds the create_estate transaction kind for the owner-setup flow. Heirs are named by Sui
// address with basis-point shares (must sum to 10000); timers are in milliseconds.
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      heirs?: string[];
      bps?: number[];
      inactivityMs?: number;
      graceMs?: number;
      sender?: string;
    };

    const heirs = body.heirs ?? [];
    const bps = body.bps ?? [];

    if (heirs.length === 0 || heirs.length !== bps.length) {
      return NextResponse.json(
        { error: "Provide at least one heir, with one share per heir." },
        { status: 400 },
      );
    }
    if (!heirs.every((h) => ADDRESS.test(h))) {
      return NextResponse.json(
        { error: "Each heir must be a 32-byte Sui address (0x…)." },
        { status: 400 },
      );
    }
    if (!bps.every((b) => Number.isInteger(b) && b > 0)) {
      return NextResponse.json(
        {
          error: "Each share must be a positive whole number of basis points.",
        },
        { status: 400 },
      );
    }
    if (bps.reduce((a, b) => a + b, 0) !== 10000) {
      return NextResponse.json(
        { error: "Shares must sum to 100% (10000 basis points)." },
        { status: 400 },
      );
    }

    const config = getPublicConfig();
    const pkg = resolvedPackageId(config);
    const client = new SuiJsonRpcClient({
      url: getJsonRpcFullnodeUrl(config.network),
      network: config.network,
    });

    const tx = new Transaction();
    if (body.sender && ADDRESS.test(body.sender)) {
      tx.setSenderIfNotSet(body.sender);
    }
    tx.moveCall({
      target: `${pkg}::${config.estateModule}::create_estate`,
      arguments: [
        tx.pure.vector("address", heirs),
        tx.pure.vector("u64", bps),
        tx.pure.option("address", null),
        tx.pure.u64(Math.max(0, Math.floor(body.inactivityMs ?? 0))),
        tx.pure.u64(Math.max(0, Math.floor(body.graceMs ?? 0))),
        tx.object.clock(),
      ],
    });

    const bytes = await tx.build({ client, onlyTransactionKind: true });

    return NextResponse.json({
      network: config.network,
      packageId: pkg,
      transactionBlockKindBytes: Buffer.from(bytes).toString("base64"),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown create-estate build error",
      },
      { status: 500 },
    );
  }
}
