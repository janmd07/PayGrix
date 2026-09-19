"use client";

import { useState, useCallback, useEffect } from "react";

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
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import { ArcTestnet } from "@circle-fin/app-kit/chains";
import { EIP1193Provider, erc20Abi, parseUnits, createPublicClient, http, encodeFunctionData } from "viem";
import { arcPublicClient, clearBalanceCache } from "@/lib/arc-client";
import { basePublicClient, clearBaseBalanceCache } from "@/lib/base-client";
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

export function useSwap(selectedNetwork: SupportedSwapChain = "Arc") {
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
            setError(null);
          }
        };

        onAccountsChanged = () => {
          if (!cleanUp) {
            if (typeof provider.request === "function") {
              provider.request({ method: "eth_chainId" })
                .then((hex: unknown) => {
                  if (!cleanUp) setProviderChainId(parseChainId(hex));
                })
                .catch(() => {
                  if (!cleanUp) setProviderChainId(null);
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
          expectedAmountOutMinimum: freshQuote.minAmountOut,
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
          amountOut: freshQuote.formattedAmountOut,
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
      // BRANCH 2: ARC TESTNET SWAP (ORIGINAL LOGIC PRESERVED)
      // ==========================================
      const adapterAddress = chainConfig.routerAddress; // PayGrixArcRouter (0xB2A97BAABaB64B389948bebB58D639a654ABac89)

      // Ensure connected wallet provider is on Arc Testnet (5042002)
      if (providerChainId !== 5042002) {
        try {
          await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: "0x4cef52" }],
          });
        } catch (switchErr: unknown) {
          const errObj = switchErr as { code?: number; message?: string };
          if (errObj.code === 4902 || errObj.message?.includes("Unrecognized chain")) {
            await provider.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: "0x4cef52",
                  chainName: "Arc Testnet",
                  nativeCurrency: { name: "Arc Testnet Ether", symbol: "ETH", decimals: 18 },
                  rpcUrls: ["https://rpc.testnet.arc.network"],
                  blockExplorerUrls: ["https://testnet.arcscan.app"],
                },
              ],
            });
          } else {
            throw switchErr;
          }
        }
      }

      const adapter = await createViemAdapterFromProvider({
        provider,
        getPublicClient: ({ chain }) => {
          if (chain.id === 5042002) {
            return arcPublicClient;
          }
          return createPublicClient({
            chain,
            transport: http(),
          });
        },
      });

      // Step 1: Check Allowance & Approve if necessary
      setStatus("approving");
      const client = arcPublicClient;

      const currentAllowance = await client.readContract({
        address: tokenInAddress,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address, adapterAddress],
      });

      if (currentAllowance < rawAmount) {
        const preparedApprove = await adapter.prepareAction(
          "token.approve",
          {
            delegate: adapterAddress,
            amount: rawAmount,
            tokenAddress: tokenInAddress,
          },
          { chain: ArcTestnet }
        );
        const approveTx = await preparedApprove.execute();
        await client.waitForTransactionReceipt({ hash: approveTx as `0x${string}` });
      }

      // Step 2: Build transaction details from server proxy
      setStatus("waiting-wallet");
      const buildRes = await fetch("/api/swap/build", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tokenInAddress,
          tokenInChain: "Arc_Testnet",
          tokenOutAddress,
          tokenOutChain: "Arc_Testnet",
          fromAddress: address,
          toAddress: address,
          amount: rawAmount.toString(),
          slippageBps: 100, // 1%
        }),
      });

      const buildData = await buildRes.json();
      if (!buildRes.ok) {
        throw new Error(buildData.error || "Failed to build transaction parameters from server.");
      }

      const rawExecParams = buildData?.transaction?.executionParams || buildData?.transaction?.executeParams;
      if (!rawExecParams || !buildData?.transaction?.signature) {
        throw new Error("Invalid build response structure received from server proxy.");
      }

      // Step 3: Parse and execute swap action
      setStatus("swapping");

      const targetAddress = buildData?.transaction?.to || buildData?.transaction?.routerAddress || adapterAddress;
      const swapCalldata = buildData?.transaction?.data || buildData?.transaction?.executionParams?.instructions?.[0]?.data;
      const isDirectRouterSwap = targetAddress.toLowerCase() === adapterAddress.toLowerCase();

      let swapTx: string;

      if (isDirectRouterSwap && swapCalldata) {
        const txHashResult = (await provider.request({
          method: "eth_sendTransaction",
          params: [
            {
              from: address,
              to: targetAddress,
              data: swapCalldata,
              value: "0x0",
            },
          ],
        })) as string;

        swapTx = txHashResult;
        setTxHash(swapTx);

        // Wait for on-chain receipt confirmation on Arc Testnet
        const receipt = await client.waitForTransactionReceipt({ hash: swapTx as `0x${string}` });
        if (receipt.status === "reverted") {
          throw new Error("On-chain swap transaction reverted.");
        }

        setStatus("completed");
        return {
          txHash: swapTx,
          amountOut: (parseFloat(buildData.estimatedAmount) / Math.pow(10, decimalsOut)).toString(),
        };
      } else {
        // Fallback: Circle SDK path for Circle relayer swaps
        interface InstructionItem {
          target: string;
          data: string;
          value: string;
          tokenIn: string;
          amountToApprove: string;
          tokenOut: string;
          minTokenOut: string;
        }

        const executeParams = {
          instructions: (rawExecParams.instructions as InstructionItem[]).map((ins: InstructionItem) => ({
            target: ins.target,
            data: ins.data,
            value: BigInt(ins.value ?? "0"),
            tokenIn: ins.tokenIn,
            amountToApprove: BigInt(ins.amountToApprove ?? "0"),
            tokenOut: ins.tokenOut,
            minTokenOut: BigInt(ins.minTokenOut ?? "0"),
          })),
          tokens: rawExecParams.tokens as { token: string; beneficiary: string }[],
          execId: BigInt(rawExecParams.execId as string),
          deadline: BigInt(rawExecParams.deadline as string),
          metadata: rawExecParams.metadata as string,
        };

        const signature = buildData.transaction.signature;
        const inputAmount = BigInt(buildData.amount || rawAmount.toString());

        const tokenInputs = [
          {
            permitType: 0,
            token: tokenInAddress as `0x${string}`,
            amount: inputAmount,
            permitCalldata: "0x" as `0x${string}`,
          },
        ];

        const preparedSwap = await adapter.prepareAction(
          "swap.execute",
          {
            executeParams,
            tokenInputs,
            signature,
            inputAmount,
            tokenInAddress,
          },
          { chain: ArcTestnet }
        );

        swapTx = (await preparedSwap.execute()) as string;
        setTxHash(swapTx);
      }

      // Step 4: Poll status proxy route until completed
      let isDone = false;
      const startTime = Date.now();
      const timeout = 60000; // 60s

      while (!isDone && Date.now() - startTime < timeout) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        try {
          const statusRes = await fetch(`/api/swap/execute-status?txHash=${swapTx}&chain=Arc_Testnet`);
          const statusData = await statusRes.json();

          if (statusRes.ok && statusData.status === "DONE") {
            isDone = true;
            setStatus("completed");
            return {
              txHash: swapTx,
              amountOut: (parseFloat(buildData.estimatedAmount) / Math.pow(10, decimalsOut)).toString(),
            };
          } else if (statusRes.ok && statusData.status === "FAILED") {
            throw new Error("On-chain swap execution failed.");
          }
        } catch (err) {
          console.warn("[SWAP DIAGNOSTIC] Error polling swap status:", err);
        }
      }

      setStatus("completed");
      return {
        txHash: swapTx,
        amountOut: (parseFloat(buildData.estimatedAmount) / Math.pow(10, decimalsOut)).toString(),
      };
    } catch (err) {
      console.error("[SWAP] Execute swap error details:", err);
      setError(sanitizeExecutionError(err));
      setStatus("failed");
      return null;
    } finally {
      clearBalanceCache();
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
      throw new Error("USDC ERC20 approval transaction reverted on-chain.");
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

  const resetSwapState = useCallback(() => {
    setStatus("idle");
    setEstimate(null);
    setTxHash("");
    setError(null);
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
  };
}
