import { NextResponse } from "next/server";
import { getZkLoginAddress } from "../../../../lib/enoki-api";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      zkLoginJwt?: string;
    };

    if (!body.zkLoginJwt) {
      return NextResponse.json(
        { error: "zkLoginJwt is required" },
        { status: 400 }
      );
    }

    const result = await getZkLoginAddress(body.zkLoginJwt);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown Enoki error" },
      { status: 500 }
    );
  }
}
