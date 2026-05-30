import { NextResponse } from "next/server";
import {
  SuiJsonRpcClient,
  getJsonRpcFullnodeUrl
} from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import {
  claimTarget,
  claimTypeArguments,
  resolvedPackageId
} from "../../../../lib/claim-receipt";
import { getPublicConfig } from "../../../../lib/config";

const OBJECT_ID_PATTERN = /^0x[0-9a-fA-F]{64}$/;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      estateId?: string;
      sender?: string;
    };

    if (!body.estateId || !OBJECT_ID_PATTERN.test(body.estateId)) {
      return NextResponse.json(
        { error: "estateId must be a 32-byte Sui object id" },
        { status: 400 }
      );
    }

    const config = getPublicConfig();
    const target = claimTarget(config);
    const typeArguments = claimTypeArguments(config);
    const client = new SuiJsonRpcClient({
      url: getJsonRpcFullnodeUrl(config.network),
      network: config.network
    });

    const tx = new Transaction();
    if (body.sender && OBJECT_ID_PATTERN.test(body.sender)) {
      tx.setSenderIfNotSet(body.sender);
    }
    tx.moveCall({
      target,
      typeArguments,
      arguments: [tx.object(body.estateId)]
    });

    const bytes = await tx.build({
      client,
      onlyTransactionKind: true
    });

    return NextResponse.json({
      network: config.network,
      packageId: resolvedPackageId(config),
      target,
      typeArguments,
      estateId: body.estateId,
      transactionBlockKindBytes: Buffer.from(bytes).toString("base64")
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown claim transaction build error"
      },
      { status: 500 }
    );
  }
}
