"use client";

import { useState, useCallback, useEffect, useRef } from "react";

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
import { useAccount } from "wagmi";
import { EIP1193Provider, erc20Abi, parseUnits, encodeFunctionData } from "viem";
import { basePublicClient, baseMainnetPublicClient, clearBaseBalanceCache } from "@/lib/base-client";
import { sanitizeExecutionError } from "@/lib/arc-read-infra";
import { SWAP_CHAINS, SupportedSwapChain } from "@/config/swap-config";
import { appendBaseBuilderSuffix } from "@/config/base-builder-code";
import {
  prepareArcMainnetExecutionPreflight,
  ArcMainnetExecutionPreflightResult,
} from "@/lib/arc-mainnet-execution-preflight";
import {
  auditAndPrepareArcMainnetApprovals,
  auditArcMainnetAllowances,
  prepareArcMainnetErc20ApprovalTx,
  prepareArcMainnetPermit2ApprovalTx,
  decodeAndValidateArcMainnetApprovalCalldata,
  ArcMainnetApprovalAuditAndPreparationResult,
  ArcMainnetPipelineStage,
  executeArcMainnetApprovalPipeline,
  MinimalApprovalProvider,
} from "@/lib/arc-mainnet-approval";
import {
  prepareArcMainnetReadiness,
  ArcMainnetExecutionEnvelope,
} from "@/lib/arc-mainnet-readiness";
import { arcMainnetPublicClient } from "@/lib/arc-mainnet-client";
import { ARC_MAINNET_UNISWAP_V4 } from "@/config/arc-mainnet";
import {
  buildArcMainnetV4Swap,
  decodeAndValidateArcMainnetV4Calldata,
} from "@/lib/arc-mainnet-build";
import { getArcMainnetV4Quote } from "@/lib/arc-mainnet-quote";
import { isAddress } from "viem";

export type SwapStatus =
  | "idle"
  | "estimating"
  | "waiting-wallet"
  | "approving"
  | "swapping"
  | "completed"
  | "failed";

export type SwapToken = "USDC" | "EURC" | "cirBTC" | "ETH";

export interface SwapHistoryItem {
  id: string;
  tokenIn: SwapToken;
  tokenOut: SwapToken;
  amountIn: string;
  amountOut: string;
  txHash: string;
  timestamp: string;
  network?: SupportedSwapChain;
  walletAddress?: string;
  userAddress?: string;
  sender?: string;
  initiator?: string;
}

export function useSwap(selectedNetwork: SupportedSwapChain = "ArcMainnet") {
  const [status, setStatus] = useState<SwapStatus>("idle");
  const [estimate, setEstimate] = useState<{
    estimatedOutput: string;
    stopLimit: string;
    fees?: ReadonlyArray<{
      token: string;
      amount: string | null;
      type: "provider" | "swap" | "gas" | "developer";
    }>;
  } | null>(null);
  const [txHash, setTxHash] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const { address, connector, isConnected } = useAccount();

  const [providerChainId, setProviderChainId] = useState<number | null>(null);
  const [approvalPipelineStage, setApprovalPipelineStage] = useState<ArcMainnetPipelineStage>("idle");
  const [approvalPipelineError, setApprovalPipelineError] = useState<string | null>(null);
  const pipelineInFlightRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const addressRef = useRef(address);
  addressRef.current = address;
  const providerChainIdRef = useRef(providerChainId);
  providerChainIdRef.current = providerChainId;

  const refreshProviderChainId = useCallback(async (): Promise<number | null> => {
    if (!connector || !isConnected) {
      setProviderChainId(null);
      return null;
    }
    try {
      const provider = (await connector.getProvider()) as EIP1193Provider;
      if (!provider || typeof provider.request !== "function") {
        setProviderChainId(null);
        return null;
      }
      const hexChainId = (await provider.request({ method: "eth_chainId" })) as string;
      const parsed = parseChainId(hexChainId);
      setProviderChainId(parsed);
      return parsed;
    } catch (err) {
      console.warn("[SWAP] Failed to read provider chain ID via eth_chainId:", err);
      setProviderChainId(null);
      return null;
    }
  }, [connector, isConnected]);

type ExtendedEIP1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
  off?: (event: string, listener: (...args: unknown[]) => void) => void;
};

  useEffect(() => {
    let cleanUp = false;
    let activeProvider: ExtendedEIP1193Provider | null = null;
    let onChainChanged: ((chainIdHex: unknown) => void) | null = null;
    let onAccountsChanged: (() => void) | null = null;

    const setupListeners = async () => {
      if (!connector || !isConnected) {
        setProviderChainId(null);
        return;
      }
      try {
        const provider = (await connector.getProvider()) as ExtendedEIP1193Provider;
        if (!provider || cleanUp) return;
        activeProvider = provider;

        // Authoritative initial read directly from provider
        if (typeof provider.request === "function") {
          try {
            const hex = await provider.request({ method: "eth_chainId" });
            if (!cleanUp) {
              setProviderChainId(parseChainId(hex));
            }
          } catch (err) {
            console.warn("[SWAP] Error fetching initial eth_chainId:", err);
            if (!cleanUp) setProviderChainId(null);
          }
        }

        onChainChanged = (chainIdHex: unknown) => {
          const parsed = parseChainId(chainIdHex);
          if (!cleanUp) {
            setProviderChainId(parsed);
            providerChainIdRef.current = parsed;
            setError(null);
            if (pipelineInFlightRef.current) {
              abortControllerRef.current?.abort();
              pipelineInFlightRef.current = false;
              setApprovalPipelineStage("aborted");
              setApprovalPipelineError("Network changed during approval. Approval pipeline aborted.");
            }
          }
        };

        onAccountsChanged = () => {
          if (!cleanUp) {
            if (pipelineInFlightRef.current) {
              abortControllerRef.current?.abort();
              pipelineInFlightRef.current = false;
              setApprovalPipelineStage("aborted");
              setApprovalPipelineError("Account changed during approval. Approval pipeline aborted.");
            }
            if (typeof provider.request === "function") {
              provider.request({ method: "eth_chainId" })
                .then((hex: unknown) => {
                  if (!cleanUp) {
                    const parsed = parseChainId(hex);
                    setProviderChainId(parsed);
                    providerChainIdRef.current = parsed;
                  }
                })
                .catch(() => {
                  if (!cleanUp) {
                    setProviderChainId(null);
                    providerChainIdRef.current = null;
                  }
                });
            }
            setError(null);
          }
        };

        if (typeof provider.on === "function") {
          provider.on("chainChanged", onChainChanged);
          provider.on("accountsChanged", onAccountsChanged);
        }
      } catch (err) {
        console.warn("[SWAP] Failed to initialize provider listeners:", err);
      }
    };

    setupListeners();

    return () => {
      cleanUp = true;
      if (activeProvider) {
        if (onChainChanged) {
          if (typeof activeProvider.removeListener === "function") {
            activeProvider.removeListener("chainChanged", onChainChanged);
          } else if (typeof activeProvider.off === "function") {
            activeProvider.off("chainChanged", onChainChanged);
          }
        }
        if (onAccountsChanged) {
          if (typeof activeProvider.removeListener === "function") {
            activeProvider.removeListener("accountsChanged", onAccountsChanged);
          } else if (typeof activeProvider.off === "function") {
            activeProvider.off("accountsChanged", onAccountsChanged);
          }
        }
      }
    };
  }, [connector, isConnected]);

  const getSwapEstimate = useCallback(async (
    amountIn: string,
    tokenIn: SwapToken,
    tokenOut: SwapToken,
    networkOverride?: SupportedSwapChain
  ) => {
    if (!amountIn || parseFloat(amountIn) <= 0) return null;
    setError(null);
    setEstimate(null);
    setStatus("estimating");

    if (!isConnected || !connector || !address) {
      setError("Wallet not connected");
      setStatus("failed");
      return null;
    }

    const network = networkOverride || selectedNetwork;
    const chainConfig = SWAP_CHAINS[network];

    try {
      const tokenInConfig = chainConfig.tokens[tokenIn];
      const tokenOutConfig = chainConfig.tokens[tokenOut];

      if (!tokenInConfig || !tokenOutConfig) {
        throw new Error(`Token pair ${tokenIn} -> ${tokenOut} not supported on ${network}`);
      }

      const tokenInAddress = tokenInConfig.address;
      const tokenOutAddress = tokenOutConfig.address;
      const decimalsIn = tokenInConfig.decimals;
      const decimalsOut = tokenOutConfig.decimals;
      const rawAmount = parseUnits(amountIn, decimalsIn).toString();

      // Query server-side proxy endpoint
      const queryParams = new URLSearchParams({
        tokenInAddress,
        tokenInChain: chainConfig.chainKey,
        tokenOutAddress,
        tokenOutChain: chainConfig.chainKey,
        fromAddress: address,
        toAddress: address,
        amount: rawAmount,
        slippageBps: "100", // 1%
      });

      const res = await fetch(`/api/swap/estimate?${queryParams.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch estimate from server proxy.");
      }

      // Convert raw output units (stringified bigints) to human-readable strings
      const estOutputStr = (parseFloat(data.quote.estimatedAmount) / Math.pow(10, decimalsOut)).toString();
      const minOutputStr = (parseFloat(data.quote.minAmount) / Math.pow(10, decimalsOut)).toString();

      interface FeeItem {
        token: string;
        amount: string | null;
        type: "provider" | "swap" | "gas" | "developer";
      }

      const fees = data.fees ? (data.fees as FeeItem[]).map((f: FeeItem) => ({
        token: f.token,
        amount: f.amount,
        type: f.type,
      })) : undefined;

      const est = {
        estimatedOutput: estOutputStr,
        stopLimit: minOutputStr,
        fees,
      };

      setEstimate(est);
      setStatus("idle");
      return est;
    } catch (err) {
      console.error("Estimate swap error:", err);
      const errMsg = err instanceof Error ? err.message : "Failed to estimate swap.";
      setError(errMsg);
      setStatus("failed");
      return null;
    }
  }, [address, connector, isConnected, selectedNetwork]);

  const executeSwap = useCallback(async (
    amountIn: string,
    tokenIn: SwapToken,
    tokenOut: SwapToken,
    networkOverride?: SupportedSwapChain,
    slippageBps: number = 100
  ) => {
    if (!amountIn || parseFloat(amountIn) <= 0) return null;
    setError(null);
    setTxHash("");
    setStatus("waiting-wallet");

    if (!isConnected || !connector || !address) {
      setError("Wallet not connected");
      setStatus("failed");
      return null;
    }

    const network = networkOverride || selectedNetwork;
    const chainConfig = SWAP_CHAINS[network];

    try {
      const tokenInConfig = chainConfig.tokens[tokenIn];
      const tokenOutConfig = chainConfig.tokens[tokenOut];
      if (!tokenInConfig || !tokenOutConfig) {
        throw new Error(`Token pair ${tokenIn} -> ${tokenOut} not supported on ${network}`);
      }

      const tokenInAddress = tokenInConfig.address;
      const tokenOutAddress = tokenOutConfig.address;
      const decimalsIn = tokenInConfig.decimals;
      const decimalsOut = tokenOutConfig.decimals;
      const rawAmount = parseUnits(amountIn, decimalsIn);

      const provider = (await connector.getProvider()) as EIP1193Provider;

      let providerChainId: number | null = null;
      try {
        const hexChainId = (await provider.request({ method: "eth_chainId" })) as string;
        providerChainId = parseChainId(hexChainId);
        setProviderChainId(providerChainId);
      } catch (err) {
        console.error("[SWAP] Failed to read provider chain ID:", err);
      }

      // ==========================================
      // BRANCH 0: ARC MAINNET (UNISWAP V4) SWAP
      // ==========================================
      if (network === "ArcMainnet") {
        const targetChainId = 5042;

        // STEP 2: Verify connected wallet chainId === 5042. If not: BLOCK execution.
        // Do NOT automatically switch networks.
        if (providerChainId !== targetChainId) {
          throw new Error(
            `Wrong network: Connected wallet chain ID is ${providerChainId ?? "unknown"}, but Arc Mainnet requires 5042. Please switch your wallet to Arc Mainnet (Chain ID 5042).`
          );
        }

        // STEP 3: Verify wallet address
        if (!address || !isAddress(address)) {
          throw new Error("Invalid or missing connected wallet address.");
        }
        const userAddress = address.toLowerCase() as `0x${string}`;

        // Verify supported token pair
        if (
          (tokenIn !== "USDC" && tokenIn !== "EURC") ||
          (tokenOut !== "USDC" && tokenOut !== "EURC") ||
          tokenIn === tokenOut
        ) {
          throw new Error(`Unsupported token pair ${tokenIn} -> ${tokenOut} on Arc Mainnet. Supported: USDC <-> EURC.`);
        }

        // STEP 4: Verify ERC20 balance
        const balance = await arcMainnetPublicClient.readContract({
          address: tokenInAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [userAddress],
        });
        if (balance < rawAmount) {
          throw new Error(
            `Insufficient ${tokenIn} balance on Arc Mainnet. Required: ${amountIn} ${tokenIn}, available: ${(Number(balance) / 1e6).toFixed(6)} ${tokenIn}.`
          );
        }

        // STEP 5 & 7: Verify on-chain allowances (do not execute without both satisfied)
        const allowanceAudit = await auditArcMainnetAllowances({
          token: tokenIn,
          owner: userAddress,
          requiredAmount: rawAmount.toString(),
          chainId: 5042,
        });

        if (allowanceAudit.state !== "BOTH_SUFFICIENT") {
          throw new Error(
            `Allowances not satisfied for Arc Mainnet swap (${allowanceAudit.state}). Please approve USDC / Permit2 before confirming swap.`
          );
        }

        // STEP 8: Request a FRESH Arc Mainnet V4 quote
        const freshQuote = await getArcMainnetV4Quote({
          tokenInAddress,
          tokenOutAddress,
          amountIn: rawAmount,
          slippageBps,
        });

        if (freshQuote.minAmountOut <= BigInt(0)) {
          throw new Error("Received non-positive output quote from Uniswap V4 Quoter.");
        }

        // STEP 9: Build fresh production calldata using buildArcMainnetV4Swap
        const buildResult = await buildArcMainnetV4Swap({
          tokenInAddress,
          tokenOutAddress,
          fromAddress: userAddress,
          toAddress: userAddress,
          amount: rawAmount.toString(),
          slippageBps,
        });

        const finalCalldata = buildResult.transaction.data;

        // STEP 10: Run final validation
        const nowSec = BigInt(Math.floor(Date.now() / 1000));
        decodeAndValidateArcMainnetV4Calldata(finalCalldata, {
          expectedTokenIn: tokenInAddress as `0x${string}`,
          expectedTokenOut: tokenOutAddress as `0x${string}`,
          expectedAmountIn: rawAmount,
          expectedAmountOutMinimum: BigInt(buildResult.minAmountOut),
          expectedZeroForOne: tokenIn === "USDC",
          minDeadline: nowSec - BigInt(60),
        });

        // STEP 11: Gas estimation against exact final transaction envelope
        let gasEstimateHex: `0x${string}` | undefined;
        try {
          const estimatedGas = await arcMainnetPublicClient.estimateGas({
            account: userAddress,
            to: ARC_MAINNET_UNISWAP_V4.universalRouter,
            data: finalCalldata,
            value: BigInt(0),
          });
          gasEstimateHex = `0x${estimatedGas.toString(16)}` as `0x${string}`;
        } catch (gasErr) {
          console.warn("[SWAP ARC MAINNET] Gas estimation notice:", gasErr);
        }

        // Prompt wallet for signature
        setStatus("waiting-wallet");
        const swapTx = (await provider.request({
          method: "eth_sendTransaction",
          params: [
            {
              from: userAddress,
              to: ARC_MAINNET_UNISWAP_V4.universalRouter,
              data: finalCalldata,
              value: "0x0",
              ...(gasEstimateHex ? { gas: gasEstimateHex } : {}),
            },
          ],
        })) as `0x${string}`;

        setTxHash(swapTx);
        setStatus("swapping");

        // Wait for on-chain receipt
        const receipt = await arcMainnetPublicClient.waitForTransactionReceipt({
          hash: swapTx,
          timeout: 60000,
        });

        if (receipt.status === "reverted") {
          throw new Error("Arc Mainnet swap transaction reverted on-chain.");
        }

        setStatus("completed");
        return {
          txHash: swapTx,
          amountOut: buildResult.quote.formattedAmountOut,
        };
      }

      // ==========================================
      // BRANCH 1: BASE SEPOLIA SWAP
      // ==========================================
      if (network === "Base") {
        const targetChainId = chainConfig.id; // 84532
        const routerAddress = chainConfig.routerAddress; // SwapRouter02 (Base Sepolia)

        // Switch wallet to Base Sepolia if needed
        if (providerChainId !== targetChainId) {
          try {
            await provider.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: "0x14a34" }],
            });
          } catch (switchErr: unknown) {
            const errObj = switchErr as { code?: number; message?: string };
            if (errObj.code === 4902 || errObj.message?.includes("Unrecognized chain")) {
              await provider.request({
                method: "wallet_addEthereumChain",
                params: [
                  {
                    chainId: "0x14a34",
                    chainName: "Base Sepolia",
                    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
                    rpcUrls: ["https://sepolia.base.org", "https://base-sepolia-rpc.publicnode.com"],
                    blockExplorerUrls: ["https://sepolia.basescan.org"],
                  },
                ],
              });
            } else {
              throw switchErr;
            }
          }
        }

        // Step 1: Check Allowance & Approve for SwapRouter02 if necessary (native ETH requires NO approval)
        const isNativeEthIn = tokenIn === "ETH";
        if (!isNativeEthIn) {
          setStatus("approving");
          const currentAllowance = await basePublicClient.readContract({
            address: tokenInAddress,
            abi: erc20Abi,
            functionName: "allowance",
            args: [address, routerAddress],
          });

          if (currentAllowance < rawAmount) {
            console.log("[SWAP BASE] Requesting token approval for SwapRouter02...");
            const approveData = encodeFunctionData({
              abi: erc20Abi,
              functionName: "approve",
              args: [routerAddress, rawAmount],
            });

            const approveTx = (await provider.request({
              method: "eth_sendTransaction",
              params: [
                {
                  from: address,
                  to: tokenInAddress,
                  data: appendBaseBuilderSuffix(approveData),
                  value: "0x0",
                },
              ],
            })) as string;

            console.log("[SWAP BASE] Approval submitted:", approveTx);
            await basePublicClient.waitForTransactionReceipt({ hash: approveTx as `0x${string}` });
          }
        }

        // Step 2: Build transaction parameters from server route
        setStatus("waiting-wallet");
        const buildRes = await fetch("/api/swap/build", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tokenInAddress,
            tokenInChain: "Base",
            tokenOutAddress,
            tokenOutChain: "Base",
            fromAddress: address,
            toAddress: address,
            amount: rawAmount.toString(),
            slippageBps: 100, // 1%
          }),
        });

        const buildData = await buildRes.json();
        if (!buildRes.ok) {
          throw new Error(buildData.error || "Failed to build transaction parameters for Base.");
        }

        const targetAddress = (buildData?.transaction?.to || routerAddress) as `0x${string}`;
        const swapCalldata = buildData?.transaction?.data as `0x${string}`;
        const swapValue = ((buildData?.transaction?.value as string) || "0x0") as `0x${string}`;

        if (!swapCalldata) {
          throw new Error("Invalid transaction payload received from server for Base swap.");
        }

        // Step 3: Execute Swap
        setStatus("swapping");
        console.log("[SWAP BASE] Executing swap on SwapRouter02:", { to: targetAddress, from: address, value: swapValue });
        const txHashResult = (await provider.request({
          method: "eth_sendTransaction",
          params: [
            {
              from: address,
              to: targetAddress,
              data: appendBaseBuilderSuffix(swapCalldata),
              value: swapValue,
            },
          ],
        })) as string;

        setTxHash(txHashResult);

        // Step 4: Await Receipt
        const receipt = await basePublicClient.waitForTransactionReceipt({ hash: txHashResult as `0x${string}` });
        if (receipt.status === "reverted") {
          throw new Error("Swap transaction reverted on Base.");
        }

        setStatus("completed");
        return {
          txHash: txHashResult,
          amountOut: (parseFloat(buildData.estimatedAmount) / Math.pow(10, decimalsOut)).toString(),
        };
      }

      // ==========================================
      // BRANCH 3: BASE MAINNET SWAP
      // ==========================================
      if (network === "BaseMainnet") {
        const targetChainId = chainConfig.id; // 8453
        const routerAddress = chainConfig.routerAddress; // SwapRouter02 (Base Mainnet)

        if ((tokenIn !== "USDC" && tokenIn !== "EURC") || (tokenOut !== "USDC" && tokenOut !== "EURC")) {
          throw new Error("Only USDC ↔ EURC swap is supported on Base Mainnet.");
        }

        // Switch wallet to Base Mainnet if needed
        if (providerChainId !== targetChainId) {
          try {
            await provider.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: "0x2105" }], // 8453
            });
          } catch (switchErr: unknown) {
            const errObj = switchErr as { code?: number; message?: string };
            if (errObj.code === 4902 || errObj.message?.includes("Unrecognized chain")) {
              await provider.request({
                method: "wallet_addEthereumChain",
                params: [
                  {
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
                ],
              });
            } else {
              throw switchErr;
            }
          }
        }

        // Step 1: Check Allowance & Approve for SwapRouter02 if necessary
        setStatus("approving");
        const currentAllowance = await baseMainnetPublicClient.readContract({
          address: tokenInAddress,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, routerAddress],
        });

        if (currentAllowance < rawAmount) {
          console.log("[SWAP BASE MAINNET] Requesting token approval for SwapRouter02...");
          const approveData = encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [routerAddress, rawAmount],
          });

          const approveTx = (await provider.request({
            method: "eth_sendTransaction",
            params: [
              {
                from: address,
                to: tokenInAddress,
                data: appendBaseBuilderSuffix(approveData),
                value: "0x0",
              },
            ],
          })) as string;

          console.log("[SWAP BASE MAINNET] Approval submitted:", approveTx);
          await baseMainnetPublicClient.waitForTransactionReceipt({ hash: approveTx as `0x${string}` });
        }

        // Step 2: Build transaction parameters from server route
        setStatus("waiting-wallet");
        const buildRes = await fetch("/api/swap/build", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tokenInAddress,
            tokenInChain: "Base_Mainnet",
            tokenOutAddress,
            tokenOutChain: "Base_Mainnet",
            fromAddress: address,
            toAddress: address,
            amount: rawAmount.toString(),
            slippageBps,
          }),
        });

        const buildData = await buildRes.json();
        if (!buildRes.ok) {
          throw new Error(buildData.error || "Failed to build transaction parameters for Base Mainnet.");
        }

        const targetAddress = (buildData?.transaction?.to || routerAddress) as `0x${string}`;
        const rawSwapCalldata = buildData?.transaction?.data as `0x${string}`;
        const swapValue = ((buildData?.transaction?.value as string) || "0x0") as `0x${string}`;

        if (!rawSwapCalldata) {
          throw new Error("Invalid transaction payload received from server for Base Mainnet swap.");
        }

        // a. Build exact final transaction payload first including builder suffix
        const finalCalldata = appendBaseBuilderSuffix(rawSwapCalldata);

        // b & c. Run pre-flight gas estimation against the exact final payload
        let gasLimitHex: `0x${string}` | undefined;
        try {
          const estimatedGas = await baseMainnetPublicClient.estimateGas({
            account: address,
            to: targetAddress,
            data: finalCalldata,
            value: BigInt(swapValue),
          });
          const bufferedGas = (estimatedGas * BigInt(120)) / BigInt(100);
          gasLimitHex = `0x${bufferedGas.toString(16)}` as `0x${string}`;
          console.log("[SWAP BASE MAINNET] Pre-flight gas estimated:", {
            estimated: estimatedGas.toString(),
            buffered: bufferedGas.toString(),
          });
        } catch (gasErr) {
          console.warn("[SWAP BASE MAINNET] Pre-flight gas estimation notice:", gasErr);
        }

        // d. Submit to wallet with explicit gas envelope
        console.log("[SWAP BASE MAINNET] Prompting wallet to sign swap on SwapRouter02:", {
          to: targetAddress,
          from: address,
          value: swapValue,
          gas: gasLimitHex,
        });

        let rawSubmittedHash: string;
        try {
          rawSubmittedHash = (await provider.request({
            method: "eth_sendTransaction",
            params: [
              {
                from: address,
                to: targetAddress,
                data: finalCalldata,
                value: swapValue,
                ...(gasLimitHex ? { gas: gasLimitHex } : {}),
              },
            ],
          })) as string;
        } catch (walletSendErr: unknown) {
          const sendErrMsg = walletSendErr instanceof Error ? walletSendErr.message : String(walletSendErr);
          console.error("[SWAP BASE MAINNET] Wallet eth_sendTransaction failed:", walletSendErr);
          if (sendErrMsg.toLowerCase().includes("user rejected") || (walletSendErr as { code?: number })?.code === 4001) {
            throw new Error("Transaction rejected by wallet.");
          }
          if (sendErrMsg.toLowerCase().includes("nonce") || sendErrMsg.toLowerCase().includes("replacement")) {
            throw new Error("Transaction submission failed due to a nonce or gas conflict in your wallet. No funds were moved.");
          }
          throw new Error(`Wallet failed to submit transaction: ${sendErrMsg}`);
        }

        // e & f. Verify transaction visibility before assuming it reached sequencer
        console.log("[SWAP BASE MAINNET] Checking transaction visibility for hash:", rawSubmittedHash);
        let isObservable = false;
        const visibilityStart = Date.now();
        const MAX_VISIBILITY_WAIT_MS = 15000;
        const POLL_INTERVAL_MS = 1500;

        while (Date.now() - visibilityStart < MAX_VISIBILITY_WAIT_MS) {
          try {
            const observedTx = await baseMainnetPublicClient.getTransaction({
              hash: rawSubmittedHash as `0x${string}`,
            });
            if (observedTx) {
              isObservable = true;
              break;
            }
          } catch {
            try {
              const directReceipt = await baseMainnetPublicClient.getTransactionReceipt({
                hash: rawSubmittedHash as `0x${string}`,
              });
              if (directReceipt) {
                isObservable = true;
                break;
              }
            } catch {
              // Sequencer / RPC hasn't indexed yet; continue polling
            }
          }
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        }

        // g. If unobservable, do not enter permanent swapping state and do not set misleading txHash
        if (!isObservable) {
          setTxHash("");
          throw new Error(
            "Transaction was submitted by wallet but could not be verified on Base Mainnet. No swap funds were moved."
          );
        }

        // h. Only set txHash and enter on-chain swapping state when observable
        setTxHash(rawSubmittedHash);
        setStatus("swapping");

        const receipt = await baseMainnetPublicClient.waitForTransactionReceipt({
          hash: rawSubmittedHash as `0x${string}`,
          timeout: 60000,
        });

        if (receipt.status === "reverted") {
          throw new Error("Swap transaction reverted on Base Mainnet.");
        }

        setStatus("completed");
        return {
          txHash: rawSubmittedHash,
          amountOut: (parseFloat(buildData.estimatedAmount) / Math.pow(10, decimalsOut)).toString(),
        };
      }

      throw new Error(`Unsupported network for swap: ${network}`);
    } catch (err) {
      console.error("[SWAP] Execute swap error details:", err);
      if (network === "BaseMainnet") {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("could not be verified on Base Mainnet") || msg.includes("No swap funds were moved")) {
          setError(msg);
        } else if (msg.toLowerCase().includes("user rejected") || (err as { code?: number })?.code === 4001) {
          setError("Transaction rejected by wallet.");
        } else if (msg.includes("revert")) {
          setError("Swap transaction reverted on Base Mainnet.");
        } else if (msg.toLowerCase().includes("nonce") || msg.toLowerCase().includes("replacement")) {
          setError("Transaction failed due to a nonce or gas fee conflict in your wallet. No swap funds were moved.");
        } else {
          setError(msg.length < 120 && !msg.includes("http") ? msg : "Swap transaction failed on Base Mainnet. No funds were lost.");
        }
      } else {
        setError(sanitizeExecutionError(err));
      }
      setStatus("failed");
      return null;
    } finally {
      clearBaseBalanceCache();
    }
  }, [address, connector, isConnected, selectedNetwork]);


  const getArcMainnetPreflight = useCallback(async (
    amountIn: string,
    tokenIn: SwapToken,
    tokenOut: SwapToken,
    slippageBps: number = 100
  ): Promise<ArcMainnetExecutionPreflightResult | null> => {
    if (!amountIn || parseFloat(amountIn) <= 0) return null;
    if (!isConnected || !address) {
      setError("Wallet not connected");
      return null;
    }
    if (tokenIn !== "USDC" && tokenIn !== "EURC") return null;
    if (tokenOut !== "USDC" && tokenOut !== "EURC") return null;

    const rawAmount = parseUnits(amountIn, 6).toString();
    return await prepareArcMainnetExecutionPreflight({
      fromAddress: address,
      toAddress: address,
      chainId: 5042,
      tokenIn,
      tokenOut,
      amount: rawAmount,
      slippageBps,
    });
  }, [address, isConnected]);

  const getArcMainnetApprovalAudit = useCallback(async (
    token: SwapToken,
    amountIn: string
  ): Promise<ArcMainnetApprovalAuditAndPreparationResult | null> => {
    if (!amountIn || parseFloat(amountIn) <= 0) return null;
    if (!isConnected || !address) {
      setError("Wallet not connected");
      return null;
    }
    if (token !== "USDC" && token !== "EURC") return null;

    const rawAmount = parseUnits(amountIn, 6).toString();
    return await auditAndPrepareArcMainnetApprovals({
      token,
      owner: address,
      requiredAmount: rawAmount,
      chainId: 5042,
    });
  }, [address, isConnected]);

  const getArcMainnetReadiness = useCallback(async (
    amountIn: string,
    tokenIn: SwapToken,
    tokenOut: SwapToken,
    slippageBps: number = 100
  ): Promise<ArcMainnetExecutionEnvelope | null> => {
    if (!amountIn || parseFloat(amountIn) <= 0) return null;
    if (!isConnected || !address) {
      setError("Wallet not connected");
      return null;
    }
    if (tokenIn !== "USDC" && tokenIn !== "EURC") return null;
    if (tokenOut !== "USDC" && tokenOut !== "EURC") return null;

    const rawAmount = parseUnits(amountIn, 6).toString();
    return await prepareArcMainnetReadiness({
      fromAddress: address,
      toAddress: address,
      chainId: 5042,
      tokenIn,
      tokenOut,
      amount: rawAmount,
      slippageBps,
    });
  }, [address, isConnected]);

  const executeArcMainnetErc20Approval = useCallback(async (
    token: "USDC" | "EURC",
    amountIn: string
  ): Promise<{ success: boolean; txHash?: string }> => {
    if (!amountIn || parseFloat(amountIn) <= 0) {
      throw new Error("Enter a valid amount to approve.");
    }
    if (!isConnected || !connector || !address) {
      throw new Error("Wallet not connected.");
    }
    const provider = (await connector.getProvider()) as EIP1193Provider;
    let providerChainId: number | null = null;
    try {
      const hexChainId = (await provider.request({ method: "eth_chainId" })) as string;
      providerChainId = parseChainId(hexChainId);
      setProviderChainId(providerChainId);
    } catch (err) {
      console.error("[SWAP] Failed to read provider chain ID:", err);
    }

    if (providerChainId !== 5042) {
      throw new Error(
        `Wrong network: Connected wallet chain ID is ${providerChainId ?? "unknown"}, but Arc Mainnet requires 5042. Please switch your wallet to Arc Mainnet (Chain ID 5042).`
      );
    }

    const rawAmount = parseUnits(amountIn, 6).toString();
    const preparedTx = prepareArcMainnetErc20ApprovalTx({
      token,
      owner: address,
      amount: rawAmount,
      chainId: 5042,
      allowUnlimited: false, // strictly exact required amount
    });

    decodeAndValidateArcMainnetApprovalCalldata(preparedTx);

    setStatus("waiting-wallet");
    let txHash: `0x${string}`;
    try {
      txHash = (await provider.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: address,
            to: preparedTx.to,
            data: preparedTx.data,
            value: "0x0",
          },
        ],
      })) as `0x${string}`;
    } catch (sendErr) {
      setStatus("failed");
      throw sendErr;
    }

    setStatus("approving");
    setTxHash(txHash);

    const receipt = await arcMainnetPublicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 60000,
    });

    if (receipt.status === "reverted") {
      setStatus("failed");
      throw new Error(`${token} ERC20 approval transaction reverted on-chain.`);
    }

    setStatus("idle");
    return { success: true, txHash };
  }, [address, connector, isConnected]);

  const executeArcMainnetPermit2Approval = useCallback(async (
    token: "USDC" | "EURC",
    amountIn: string
  ): Promise<{ success: boolean; txHash?: string }> => {
    if (!amountIn || parseFloat(amountIn) <= 0) {
      throw new Error("Enter a valid amount to approve.");
    }
    if (!isConnected || !connector || !address) {
      throw new Error("Wallet not connected.");
    }
    const provider = (await connector.getProvider()) as EIP1193Provider;
    let providerChainId: number | null = null;
    try {
      const hexChainId = (await provider.request({ method: "eth_chainId" })) as string;
      providerChainId = parseChainId(hexChainId);
      setProviderChainId(providerChainId);
    } catch (err) {
      console.error("[SWAP] Failed to read provider chain ID:", err);
    }

    if (providerChainId !== 5042) {
      throw new Error(
        `Wrong network: Connected wallet chain ID is ${providerChainId ?? "unknown"}, but Arc Mainnet requires 5042. Please switch your wallet to Arc Mainnet (Chain ID 5042).`
      );
    }

    const rawAmount = parseUnits(amountIn, 6).toString();
    const preparedTx = prepareArcMainnetPermit2ApprovalTx({
      token,
      owner: address,
      amount: rawAmount,
      chainId: 5042,
      expirationSeconds: 30 * 86400,
      allowUnlimited: false, // strictly exact required amount
    });

    decodeAndValidateArcMainnetApprovalCalldata(preparedTx);

    setStatus("waiting-wallet");
    let txHash: `0x${string}`;
    try {
      txHash = (await provider.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: address,
            to: preparedTx.to,
            data: preparedTx.data,
            value: "0x0",
          },
        ],
      })) as `0x${string}`;
    } catch (sendErr) {
      setStatus("failed");
      throw sendErr;
    }

    setStatus("approving");
    setTxHash(txHash);

    const receipt = await arcMainnetPublicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 60000,
    });

    if (receipt.status === "reverted") {
      setStatus("failed");
      throw new Error("Permit2 approval transaction reverted on-chain.");
    }

    setStatus("idle");
    return { success: true, txHash };
  }, [address, connector, isConnected]);

  const startApprovalPipeline = useCallback(async (
    token: "USDC" | "EURC",
    amountIn: string
  ): Promise<boolean> => {
    if (!amountIn || parseFloat(amountIn) <= 0) {
      setApprovalPipelineError("Enter a valid amount to swap.");
      return false;
    }
    if (!isConnected || !connector || !address) {
      setApprovalPipelineError("Wallet not connected.");
      return false;
    }

    // Synchronous in-flight guard
    if (pipelineInFlightRef.current) {
      console.warn("[SWAP] Approval pipeline already in-flight. Ignoring duplicate invocation.");
      return false;
    }
    pipelineInFlightRef.current = true;
    setApprovalPipelineError(null);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const provider = (await connector.getProvider()) as EIP1193Provider;
      if (!provider || typeof provider.request !== "function") {
        throw new Error("Wallet provider is not available.");
      }

      // 1. Verify Arc Mainnet network (5042)
      let currentChainId = providerChainIdRef.current;
      try {
        const hexChain = (await provider.request({ method: "eth_chainId" })) as string;
        currentChainId = parseChainId(hexChain);
        setProviderChainId(currentChainId);
        providerChainIdRef.current = currentChainId;
      } catch {
        // ignore
      }

      if (currentChainId !== 5042) {
        throw new Error(
          `Wrong network: Connected wallet chain ID is ${currentChainId ?? "unknown"}, but Arc Mainnet requires 5042. Please switch your wallet to Arc Mainnet.`
        );
      }

      // 2. Run pure approval pipeline engine
      const rawAmount = parseUnits(amountIn, 6).toString();
      const pipelineRes = await executeArcMainnetApprovalPipeline({
        token,
        owner: address as `0x${string}`,
        requiredAmount: rawAmount,
        provider: provider as unknown as MinimalApprovalProvider,
        publicClient: arcMainnetPublicClient,
        onStageChange: (stage) => {
          setApprovalPipelineStage(stage);
          if (stage === "erc20_wallet" || stage === "permit2_wallet") {
            setStatus("waiting-wallet");
          } else if (stage === "erc20_receipt" || stage === "permit2_receipt") {
            setStatus("approving");
          } else if (stage === "review_ready" || stage === "idle") {
            setStatus("idle");
          }
        },
        onTxSent: (_stage, hash) => {
          setTxHash(hash);
        },
        getLatestAccount: () => addressRef.current,
        getLatestChainId: () => providerChainIdRef.current,
        signal: abortController.signal,
      });

      if (!pipelineRes.success) {
        setApprovalPipelineError(pipelineRes.error || "Approval pipeline failed.");
        setStatus("failed");
        return false;
      }

      setApprovalPipelineStage("review_ready");
      setStatus("idle");
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Approval pipeline failed.";
      setApprovalPipelineStage("aborted");
      setApprovalPipelineError(msg);
      setStatus("failed");
      return false;
    } finally {
      pipelineInFlightRef.current = false;
      abortControllerRef.current = null;
    }
  }, [address, connector, isConnected]);

  const resetSwapState = useCallback(() => {
    setStatus("idle");
    setEstimate(null);
    setTxHash("");
    setError(null);
    setApprovalPipelineStage("idle");
    setApprovalPipelineError(null);
  }, []);

  return {
    status,
    estimate,
    txHash,
    error,
    providerChainId,
    refreshProviderChainId,
    getSwapEstimate,
    getArcMainnetPreflight,
    getArcMainnetApprovalAudit,
    getArcMainnetReadiness,
    executeArcMainnetErc20Approval,
    executeArcMainnetPermit2Approval,
    executeSwap,
    resetSwapState,
    approvalPipelineStage,
    approvalPipelineError,
    startApprovalPipeline,
  };
}
