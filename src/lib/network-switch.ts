/**
 * Network Switch and Chain Verification Helper
 *
 * Provides safe, pre-transaction network switching for PayGrix.
 * Detects whether the connected wallet is on the required chain before
 * executing transactions. Prompts the native wallet popup via
 * wallet_switchEthereumChain (and wallet_addEthereumChain if unrecognized),
 * and verifies that the wallet has actually switched before allowing any
 * transaction to proceed.
 */

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

export interface MinimalEIP1193Provider {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  request: (args: any) => Promise<any>;
}

export interface EnsureNetworkResult {
  success: boolean;
  chainId: number | null;
  switched: boolean;
  added?: boolean;
  rejected?: boolean;
  error?: string;
}

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

export function toHexChainId(chainId: number): `0x${string}` {
  return `0x${chainId.toString(16)}` as `0x${string}`;
}

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

export const CHAIN_ADD_PARAMETERS: Record<number, AddEthereumChainParameter> = {
  5042: {
    chainId: "0x13b2",
    chainName: "Arc Mainnet",
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
    rpcUrls: ["https://rpc.arc.network"],
    blockExplorerUrls: ["https://arcscan.app"],
  },
  8453: {
    chainId: "0x2105",
    chainName: "Base",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: [
      "https://mainnet.base.org",
      "https://base-rpc.publicnode.com",
      "https://1rpc.io/base",
    ],
    blockExplorerUrls: ["https://basescan.org"],
  },
  84532: {
    chainId: "0x14a34",
    chainName: "Base Sepolia",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: [
      "https://sepolia.base.org",
      "https://base-sepolia-rpc.publicnode.com",
    ],
    blockExplorerUrls: ["https://sepolia.basescan.org"],
  },
  5042002: {
    chainId: "0x4cf072",
    chainName: "Arc Testnet",
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
    rpcUrls: ["https://rpc.testnet.arc.network/"],
    blockExplorerUrls: ["https://testnet.arcscan.app"],
  },
  421614: {
    chainId: "0x66eee",
    chainName: "Arbitrum Sepolia",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://sepolia-rollup.arbitrum.io/rpc"],
    blockExplorerUrls: ["https://sepolia.arbiscan.io"],
  },
};

export const CHAIN_DISPLAY_NAMES: Record<number, string> = {
  5042: "Arc Mainnet",
  8453: "Base Mainnet",
  84532: "Base Sepolia",
  5042002: "Arc Testnet",
  421614: "Arbitrum Sepolia",
};

/**
 * Ensures the connected wallet is on targetChainId before a transaction is initiated.
 *
 * 1. Checks current wallet chain ID. If already on targetChainId: no popup, returns success.
 * 2. If different: requests wallet to switch to targetChainId.
 * 3. Handles unrecognized chain (code 4902) by requesting wallet_addEthereumChain.
 * 4. Rigorously verifies that post-switch eth_chainId equals targetChainId.
 * 5. Returns success: false if user rejected, switch failed, or verified chain does not match.
 */
export async function ensureWalletNetwork({
  provider,
  targetChainId,
  switchChainAsync,
}: {
  provider: MinimalEIP1193Provider;
  targetChainId: number;
  switchChainAsync?: (args: { chainId: number }) => Promise<unknown>;
}): Promise<EnsureNetworkResult> {
  if (!provider || typeof provider.request !== "function") {
    return {
      success: false,
      chainId: null,
      switched: false,
      error: "Wallet provider is not available. Please ensure your wallet is connected.",
    };
  }

  const targetName = CHAIN_DISPLAY_NAMES[targetChainId] ?? `Chain ID ${targetChainId}`;
  const targetHex = toHexChainId(targetChainId);
  const chainParams = CHAIN_ADD_PARAMETERS[targetChainId];

  // 1. Read current chain ID
  let currentHex: unknown;
  try {
    currentHex = await provider.request({ method: "eth_chainId" });
  } catch {
    // Proceed to attempt switch
  }

  const currentChainId = parseChainId(currentHex);

  // If already on the correct network: no switch popup, continue normally
  if (currentChainId === targetChainId) {
    return {
      success: true,
      chainId: targetChainId,
      switched: false,
    };
  }

  // 2. Request network switch
  let switched = false;
  let added = false;

  try {
    if (switchChainAsync) {
      try {
        await switchChainAsync({ chainId: targetChainId });
        switched = true;
      } catch (switchAsyncErr: unknown) {
        if (isUserRejectionError(switchAsyncErr)) {
          throw switchAsyncErr;
        }
        // Fall back to direct provider request if wagmi switchChainAsync fails for non-rejection reason
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: targetHex }],
        });
        switched = true;
      }
    } else {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: targetHex }],
      });
      switched = true;
    }
  } catch (switchErr: unknown) {
    if (isUserRejectionError(switchErr)) {
      return {
        success: false,
        chainId: currentChainId,
        switched: false,
        rejected: true,
        error: `Network switch request to ${targetName} was rejected in your wallet. Transaction was not submitted.`,
      };
    }

    if (!isUnrecognizedChainError(switchErr) || !chainParams) {
      const msg = switchErr instanceof Error ? switchErr.message : `Failed to switch network to ${targetName}.`;
      return {
        success: false,
        chainId: currentChainId,
        switched: false,
        error: msg,
      };
    }

    // 3. Chain not recognized (code 4902) -> prompt wallet_addEthereumChain
    try {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [chainParams],
      });
      added = true;
    } catch (addErr: unknown) {
      if (isUserRejectionError(addErr)) {
        return {
          success: false,
          chainId: currentChainId,
          switched: false,
          added: false,
          rejected: true,
          error: `Adding ${targetName} network was rejected in your wallet. Transaction was not submitted.`,
        };
      }

      const msg = addErr instanceof Error ? addErr.message : `Failed to add ${targetName} to wallet.`;
      return {
        success: false,
        chainId: currentChainId,
        switched: false,
        error: msg,
      };
    }
  }

  // 4. Verify post-switch/post-add chain ID
  let postHex: unknown;
  try {
    postHex = await provider.request({ method: "eth_chainId" });
  } catch {
    // Query failed
  }

  let verifiedChainId = parseChainId(postHex);

  // If wallet added the network but did not switch automatically, request switch now
  if (verifiedChainId !== targetChainId && added) {
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: targetHex }],
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
          rejected: true,
          error: `Network switch request to ${targetName} was rejected in your wallet. Transaction was not submitted.`,
        };
      }
    }
  }

  // 5. Strict safety assertion: verify the chain ID matches the target chain ID
  if (verifiedChainId !== targetChainId) {
    return {
      success: false,
      chainId: verifiedChainId,
      switched,
      added,
      error: `Wallet remains connected to chain ID ${verifiedChainId ?? "unknown"}. Expected ${targetName} (${targetChainId}). Transaction was not submitted.`,
    };
  }

  return {
    success: true,
    chainId: targetChainId,
    switched: true,
    added,
  };
}
