import { NextResponse } from "next/server";
import { createZkLoginProof } from "../../../../lib/enoki-api";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      zkLoginJwt?: string;
      ephemeralPublicKey?: string;
      maxEpoch?: number;
      randomness?: string;
    };

    if (!body.zkLoginJwt || !body.ephemeralPublicKey || body.maxEpoch === undefined || !body.randomness) {
      return NextResponse.json(
        {
          error:
            "zkLoginJwt, ephemeralPublicKey, maxEpoch, and randomness are required"
        },
        { status: 400 }
      );
    }

    const result = await createZkLoginProof({
      zkLoginJwt: body.zkLoginJwt,
      ephemeralPublicKey: body.ephemeralPublicKey,
      maxEpoch: body.maxEpoch,
      randomness: body.randomness
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown Enoki error" },
      { status: 500 }
    );
  }
}
