import { NextResponse } from "next/server";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { getPublicConfig } from "../../../../lib/config";
import { resolvedPackageId } from "../../../../lib/claim-receipt";

const ADDRESS = /^0x[0-9a-fA-F]{64}$/;

// Builds the executor_pause transaction kind: the named executor pauses a PENDING estate during
// the grace window, resetting it to ACTIVE before assets become claimable.
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      estateId?: string;
      sender?: string;
    };

    if (!body.estateId || !ADDRESS.test(body.estateId)) {
      return NextResponse.json(
        { error: "estateId must be a 32-byte Sui object id" },
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
      target: `${pkg}::${config.estateModule}::executor_pause`,
      arguments: [tx.object(body.estateId), tx.object.clock()],
    });

    const bytes = await tx.build({ client, onlyTransactionKind: true });

    return NextResponse.json({
      network: config.network,
      packageId: pkg,
      estateId: body.estateId,
      transactionBlockKindBytes: Buffer.from(bytes).toString("base64"),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown executor-pause build error",
      },
      { status: 500 },
    );
  }
}
