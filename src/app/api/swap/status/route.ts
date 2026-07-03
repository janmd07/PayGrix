import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    enabled: !!process.env.STABLECOIN_KIT_API_KEY,
  });
}
