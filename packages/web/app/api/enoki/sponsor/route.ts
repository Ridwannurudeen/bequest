import { NextResponse } from "next/server";
import { createSponsoredTransaction } from "../../../../lib/enoki-api";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      zkLoginJwt?: string;
      sender?: string;
      transactionBlockKindBytes?: string;
    };

    if (!body.transactionBlockKindBytes) {
      return NextResponse.json(
        { error: "transactionBlockKindBytes is required" },
        { status: 400 }
      );
    }

    if (!body.zkLoginJwt && !body.sender) {
      return NextResponse.json(
        { error: "Either zkLoginJwt or sender is required" },
        { status: 400 }
      );
    }

    const result = await createSponsoredTransaction({
      zkLoginJwt: body.zkLoginJwt,
      sender: body.sender,
      transactionBlockKindBytes: body.transactionBlockKindBytes
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown Enoki error" },
      { status: 500 }
    );
  }
}
