"use client";

import { useState, useCallback } from "react";
import { useAccount } from "wagmi";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import { ArcTestnet } from "@circle-fin/app-kit/chains";
import { EIP1193Provider, erc20Abi, parseUnits, createPublicClient, http, encodeFunctionData } from "viem";
import { arcPublicClient, clearBalanceCache } from "@/lib/arc-client";
import { basePublicClient, clearBaseBalanceCache } from "@/lib/base-client";
import { sanitizeExecutionError } from "@/lib/arc-read-infra";
import { SWAP_CHAINS, SupportedSwapChain } from "@/config/swap-config";

export type SwapStatus =
  | "idle"
  | "estimating"
  | "waiting-wallet"
  | "approving"
  | "swapping"
  | "completed"
  | "failed";

export interface SwapHistoryItem {
  id: string;
  tokenIn: "USDC" | "EURC" | "cirBTC";
  tokenOut: "USDC" | "EURC" | "cirBTC";
  amountIn: string;
  amountOut: string;
  txHash: string;
  timestamp: string;
  network?: SupportedSwapChain;
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

  const getSwapEstimate = useCallback(async (
    amountIn: string,
    tokenIn: "USDC" | "EURC" | "cirBTC",
    tokenOut: "USDC" | "EURC" | "cirBTC",
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
    tokenIn: "USDC" | "EURC" | "cirBTC",
    tokenOut: "USDC" | "EURC" | "cirBTC",
    networkOverride?: SupportedSwapChain
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
        providerChainId = parseInt(hexChainId, 16);
      } catch (err) {
        console.error("[SWAP] Failed to read provider chain ID:", err);
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

        // Step 1: Check Allowance & Approve for SwapRouter02 if necessary
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
                data: approveData,
                value: "0x0",
              },
            ],
          })) as string;

          console.log("[SWAP BASE] Approval submitted:", approveTx);
          await basePublicClient.waitForTransactionReceipt({ hash: approveTx as `0x${string}` });
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

        const targetAddress = buildData?.transaction?.to || routerAddress;
        const swapCalldata = buildData?.transaction?.data;

        if (!swapCalldata) {
          throw new Error("Invalid transaction payload received from server for Base swap.");
        }

        // Step 3: Execute Swap
        setStatus("swapping");
        console.log("[SWAP BASE] Executing swap on SwapRouter02:", { to: targetAddress, from: address });
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
    getSwapEstimate,
    executeSwap,
    resetSwapState,
  };
}
