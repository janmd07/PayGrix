import { NextResponse } from "next/server";
import { arcMainnetPublicClient } from "@/lib/arc-mainnet-client";
import { basePublicClient, baseMainnetPublicClient } from "@/lib/base-client";

const ARC_MAINNET_CHAIN = "Arc_Mainnet";
const BASE_MAINNET_CHAIN = "Base_Mainnet";
const BASE_CHAIN = "Base";

function isValidTxHash(hash: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(hash);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const txHash = searchParams.get("txHash") || "";
  const chain = searchParams.get("chain") || "";

  // Server-side validation
  if (chain !== ARC_MAINNET_CHAIN && chain !== BASE_MAINNET_CHAIN && chain !== BASE_CHAIN) {
    return NextResponse.json(
      { error: "Unsupported chain. Supported chains are Arc_Mainnet, Base_Mainnet, and Base." },
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
    const client =
      chain === BASE_MAINNET_CHAIN
        ? baseMainnetPublicClient
        : chain === BASE_CHAIN
        ? basePublicClient
        : arcMainnetPublicClient;
    const receipt = await client.getTransactionReceipt({
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

