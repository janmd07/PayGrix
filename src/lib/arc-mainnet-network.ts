/**
 * Arc Mainnet Network Management
 *
 * Dedicated helper to manage switching to and adding the Arc Mainnet network (Chain ID 5042)
 * in EIP-1193 compliant browser wallets (MetaMask, Coinbase Wallet, Brave, Rabby, etc.).
 *
 * Reuses canonical network configuration from '@/config/arc-mainnet'.
 */

import { arcMainnet, ARC_MAINNET_CONFIG } from "@/config/arc-mainnet";

export const ARC_MAINNET_CHAIN_ID = arcMainnet.id; // 5042
export const ARC_MAINNET_CHAIN_ID_HEX = `0x${arcMainnet.id.toString(16)}` as const; // "0x13b2"
export const ARC_MAINNET_CHAIN_ID_HEX_UPPER = "0x13B2";

export interface AddEthereumChainParameter {
  chainId: string;
  chainName: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrls: string[];
  blockExplorerUrls?: string[];
}

export const ARC_MAINNET_NETWORK_PARAMS: AddEthereumChainParameter = {
  chainId: ARC_MAINNET_CHAIN_ID_HEX,
  chainName: ARC_MAINNET_CONFIG.name,
  nativeCurrency: {
    name: ARC_MAINNET_CONFIG.nativeCurrency.name,
    symbol: ARC_MAINNET_CONFIG.nativeCurrency.symbol,
    decimals: ARC_MAINNET_CONFIG.nativeCurrency.decimals,
  },
  rpcUrls: [ARC_MAINNET_CONFIG.rpcUrl],
  blockExplorerUrls: [ARC_MAINNET_CONFIG.explorerUrl],
};

export interface EnsureArcMainnetNetworkResult {
  success: boolean;
  chainId: number | null;
  switched: boolean;
  added: boolean;
  error?: string;
}

export interface MinimalEIP1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

/**
 * Parses a chain ID from decimal number or hex string representation.
 */
export function parseChainId(chainId: unknown): number | null {
  if (typeof chainId === "number") {
    return Number.isFinite(chainId) ? chainId : null;
  }
  if (typeof chainId === "string") {
    const trimmed = chainId.trim();
    if (trimmed.startsWith("0x") || trimmed.startsWith("0X")) {
      const parsed = parseInt(trimmed, 16);
      return Number.isFinite(parsed) ? parsed : null;
    }
    const parsed = parseInt(trimmed, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Checks if an error corresponds to user rejection (EIP-1193 error code 4001).
 */
export function isUserRejectionError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: number | string; message?: string; cause?: unknown };
  if (e.code === 4001 || e.code === "4001" || e.code === "ACTION_REJECTED") {
    return true;
  }
  if (typeof e.message === "string") {
    const lower = e.message.toLowerCase();
    if (
      lower.includes("user rejected") ||
      lower.includes("user denied") ||
      lower.includes("user cancelled") ||
      lower.includes("user canceled") ||
      lower.includes("rejected the request")
    ) {
      return true;
    }
  }
  if (e.cause && typeof e.cause === "object") {
    return isUserRejectionError(e.cause);
  }
  return false;
}

/**
 * Checks if an error corresponds to an unrecognized/missing chain (EIP-1193 error code 4902).
 */
export function isUnrecognizedChainError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as {
    code?: number | string;
    message?: string;
    data?: { originalError?: { code?: number | string } };
    cause?: unknown;
  };
  if (e.code === 4902 || e.code === "4902") {
    return true;
  }
  if (e.data?.originalError?.code === 4902 || e.data?.originalError?.code === "4902") {
    return true;
  }
  if (typeof e.message === "string") {
    const lower = e.message.toLowerCase();
    if (
      lower.includes("4902") ||
      lower.includes("unrecognized chain") ||
      lower.includes("unknown chain") ||
      lower.includes("wallet_addethereumchain") ||
      lower.includes("has not been added") ||
      lower.includes("not recognized")
    ) {
      return true;
    }
  }
  if (e.cause && typeof e.cause === "object") {
    return isUnrecognizedChainError(e.cause);
  }
  return false;
}

/**
 * Ensures the connected wallet is switched to Arc Mainnet (Chain ID 5042).
 * If Arc Mainnet is not recognized by the wallet (error 4902), prompts the user
 * to add Arc Mainnet via wallet_addEthereumChain.
 *
 * This function is designed to be called strictly from the user-initiated review/action handler
 * and does NOT broadcast any transactions, token approvals, or signatures.
 */
export async function ensureArcMainnetNetwork(
  provider: MinimalEIP1193Provider
): Promise<EnsureArcMainnetNetworkResult> {
  if (!provider || typeof provider.request !== "function") {
    return {
      success: false,
      chainId: null,
      switched: false,
      added: false,
      error: "Wallet provider is not available or does not support EIP-1193 requests.",
    };
  }

  // 1. Read current chain ID
  let currentHex: unknown;
  try {
    currentHex = await provider.request({ method: "eth_chainId" });
  } catch {
    return {
      success: false,
      chainId: null,
      switched: false,
      added: false,
      error: "Failed to query wallet chain ID.",
    };
  }

  const currentChainId = parseChainId(currentHex);
  if (currentChainId === ARC_MAINNET_CHAIN_ID) {
    return {
      success: true,
      chainId: ARC_MAINNET_CHAIN_ID,
      switched: false,
      added: false,
    };
  }

  // 2. Request network switch
  let switched = false;
  let added = false;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: ARC_MAINNET_CHAIN_ID_HEX }],
    });
    switched = true;
  } catch (switchErr: unknown) {
    if (isUserRejectionError(switchErr)) {
      return {
        success: false,
        chainId: currentChainId,
        switched: false,
        added: false,
        error: "Network switch request was rejected in wallet. Swap transaction was not submitted.",
      };
    }

    if (!isUnrecognizedChainError(switchErr)) {
      const msg = switchErr instanceof Error ? switchErr.message : "Failed to switch network in wallet.";
      return {
        success: false,
        chainId: currentChainId,
        switched: false,
        added: false,
        error: msg,
      };
    }

    // 3. Chain not recognized (code 4902) -> prompt wallet_addEthereumChain
    try {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [ARC_MAINNET_NETWORK_PARAMS],
      });
      added = true;
    } catch (addErr: unknown) {
      if (isUserRejectionError(addErr)) {
        return {
          success: false,
          chainId: currentChainId,
          switched: false,
          added: false,
          error: "Adding Arc Mainnet network was rejected in wallet. Swap transaction was not submitted.",
        };
      }

      const msg = addErr instanceof Error ? addErr.message : "Failed to add Arc Mainnet to wallet.";
      return {
        success: false,
        chainId: currentChainId,
        switched: false,
        added: false,
        error: msg,
      };
    }
  }

  // 4. Verify post-switch/post-add chain ID
  let postHex: unknown;
  try {
    postHex = await provider.request({ method: "eth_chainId" });
  } catch {
    // If querying fails, leave postHex undefined
  }

  let verifiedChainId = parseChainId(postHex);

  // If wallet added the network but did not switch automatically, request switch now
  if (verifiedChainId !== ARC_MAINNET_CHAIN_ID && added) {
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: ARC_MAINNET_CHAIN_ID_HEX }],
      });
      switched = true;
      postHex = await provider.request({ method: "eth_chainId" });
      verifiedChainId = parseChainId(postHex);
    } catch (postSwitchErr: unknown) {
      if (isUserRejectionError(postSwitchErr)) {
        return {
          success: false,
          chainId: verifiedChainId,
          switched: false,
          added: true,
          error: "Network switch request was rejected in wallet. Swap transaction was not submitted.",
        };
      }
    }
  }

  if (verifiedChainId === ARC_MAINNET_CHAIN_ID) {
    return {
      success: true,
      chainId: ARC_MAINNET_CHAIN_ID,
      switched: switched || true,
      added,
    };
  }

  return {
    success: false,
    chainId: verifiedChainId,
    switched: false,
    added,
    error: `Wallet network setup incomplete. Connected chain ID is ${verifiedChainId ?? "unknown"}, but Arc Mainnet requires ${ARC_MAINNET_CHAIN_ID}.`,
  };
}
