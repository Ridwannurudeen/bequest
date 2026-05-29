import { NextResponse } from "next/server";
import { createNonce } from "../../../../lib/enoki-api";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      ephemeralPublicKey?: string;
      additionalEpochs?: number;
    };

    if (!body.ephemeralPublicKey) {
      return NextResponse.json(
        { error: "ephemeralPublicKey is required" },
        { status: 400 }
      );
    }

    const result = await createNonce({
      ephemeralPublicKey: body.ephemeralPublicKey,
      additionalEpochs: body.additionalEpochs
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown Enoki error" },
      { status: 500 }
    );
  }
}
