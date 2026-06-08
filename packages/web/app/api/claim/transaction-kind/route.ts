import { NextResponse } from "next/server";
import {
  SuiJsonRpcClient,
  getJsonRpcFullnodeUrl
} from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { resolvedPackageId } from "../../../../lib/claim-receipt";
import { getPublicConfig } from "../../../../lib/config";

const OBJECT_ID_PATTERN = /^0x[0-9a-fA-F]{64}$/;

// Enumerate every escrowed `CoinKey<T>` dynamic field on the Estate. Mirrors the
// keeper's distributeAll() so the heir claim moves the whole portfolio, not just SUI.
async function escrowedCoinTypes(
  client: SuiJsonRpcClient,
  estateId: string
): Promise<string[]> {
  const types: string[] = [];
  let cursor: string | null | undefined = null;
  do {
    const page = await client.getDynamicFields({ parentId: estateId, cursor });
    for (const df of page.data) {
      const name = typeof df.name?.type === "string" ? df.name.type : "";
      const match = name.match(/::estate::CoinKey<(.+)>$/);
      if (match) types.push(match[1]);
    }
    cursor = page.hasNextPage ? page.nextCursor : null;
  } while (cursor);
  return types;
}

// The Estate's ObjectBag id (key+store objects live here, each assigned to a heir).
async function objectBagId(
  client: SuiJsonRpcClient,
  estateId: string
): Promise<string | null> {
  const res = await client.getObject({
    id: estateId,
    options: { showContent: true }
  });
  const content = res.data?.content;
  if (!content || content.dataType !== "moveObject") return null;
  const fields = content.fields as {
    objects?: { fields?: { id?: { id?: string } } };
  };
  return fields.objects?.fields?.id?.id ?? null;
}

// Group escrowed objects by their Move type (one distribute_objects<T> call per type).
async function escrowedObjectsByType(
  client: SuiJsonRpcClient,
  bagId: string
): Promise<Map<string, string[]>> {
  const byType = new Map<string, string[]>();
  let cursor: string | null | undefined = null;
  do {
    const page = await client.getDynamicFields({ parentId: bagId, cursor });
    for (const df of page.data) {
      if (!df.objectType || !df.objectId) continue;
      const ids = byType.get(df.objectType) ?? [];
      ids.push(df.objectId);
      byType.set(df.objectType, ids);
    }
    cursor = page.hasNextPage ? page.nextCursor : null;
  } while (cursor);
  return byType;
}

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
    const pkg = resolvedPackageId(config);
    const moduleName = config.estateModule;
    const client = new SuiJsonRpcClient({
      url: getJsonRpcFullnodeUrl(config.network),
      network: config.network
    });

    const coinTypes = await escrowedCoinTypes(client, body.estateId);
    const bagId = await objectBagId(client, body.estateId);
    const objectsByType = bagId
      ? await escrowedObjectsByType(client, bagId)
      : new Map<string, string[]>();

    if (coinTypes.length === 0 && objectsByType.size === 0) {
      return NextResponse.json(
        { error: "Estate holds no escrowed assets to distribute" },
        { status: 409 }
      );
    }

    const tx = new Transaction();
    if (body.sender && OBJECT_ID_PATTERN.test(body.sender)) {
      tx.setSenderIfNotSet(body.sender);
    }
    // One distribute_coin<T> per escrowed coin type (splits by heir bps),
    // one distribute_objects<T> per object type (each object to its assigned heir).
    for (const coinType of coinTypes) {
      tx.moveCall({
        target: `${pkg}::${moduleName}::distribute_coin`,
        typeArguments: [coinType],
        arguments: [tx.object(body.estateId)]
      });
    }
    for (const [objectType, ids] of objectsByType) {
      tx.moveCall({
        target: `${pkg}::${moduleName}::distribute_objects`,
        typeArguments: [objectType],
        arguments: [tx.object(body.estateId), tx.pure.vector("id", ids)]
      });
    }

    const bytes = await tx.build({ client, onlyTransactionKind: true });

    return NextResponse.json({
      network: config.network,
      packageId: pkg,
      estateId: body.estateId,
      distributions: {
        coinTypes,
        objectTypes: [...objectsByType.keys()],
        objectCount: [...objectsByType.values()].reduce(
          (total, ids) => total + ids.length,
          0
        )
      },
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
