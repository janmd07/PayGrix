import { NextResponse } from "next/server";
import { arcPublicClient } from "@/lib/arc-client";

const ARC_TESTNET_CHAIN = "Arc_Testnet";

function isValidTxHash(hash: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(hash);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const txHash = searchParams.get("txHash") || "";
  const chain = searchParams.get("chain") || "";

  // Server-side validation
  if (chain !== ARC_TESTNET_CHAIN) {
    return NextResponse.json(
      { error: "Unsupported chain. Only Arc Testnet is supported." },
      { status: 400 }
    );
  }

  if (!isValidTxHash(txHash)) {
    return NextResponse.json(
      { error: "Invalid EVM transaction hash." },
      { status: 400 }
    );
  }

  try {
    const receipt = await arcPublicClient.getTransactionReceipt({
      hash: txHash as `0x${string}`,
    });

    if (!receipt) {
      return NextResponse.json({ status: "PENDING" });
    }

    if (receipt.status === "success") {
      return NextResponse.json({ status: "DONE" });
    } else {
      return NextResponse.json({ status: "FAILED" });
    }
  } catch {
    // Transaction not mined yet or pending
    return NextResponse.json({ status: "PENDING" });
  }
}
