import { NextResponse } from "next/server";
import { executeSponsoredTransaction } from "../../../../lib/enoki-api";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      digest?: string;
      signature?: string;
    };

    if (!body.digest || !body.signature) {
      return NextResponse.json(
        { error: "digest and signature are required" },
        { status: 400 }
      );
    }

    const result = await executeSponsoredTransaction({
      digest: body.digest,
      signature: body.signature
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown Enoki error" },
      { status: 500 }
    );
  }
}
