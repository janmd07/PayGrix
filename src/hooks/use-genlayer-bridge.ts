"use client";

import { useState, useCallback } from "react";
import { useAccount, useWalletClient, usePublicClient, useSwitchChain } from "wagmi";
import { isAddress, parseUnits, decodeEventLog } from "viem";

export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const FORBIDDEN_CHAIN_ID = 8453; // Base Mainnet
export const BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;

// Configurable router & token targets for PayGrix Base <-> GenLayer Bridge
export const PAYGRIX_BASE_ROUTER_ADDRESS = "0x05c69956564c556fc303Cb74C5505D0E1e8EDF2D" as const;
export const PAYGRIX_BRIDGE_VAULT_ADDRESS = "0x9e5807B3470AF8E5a316FEa847fd87EdB2DCFfF7" as const;
export const GENLAYER_BRADBURY_BRIDGE_MANAGER = "0x70Fe1FbABb032B4F99FeEAbea3D26326321aF8e2" as const;
export const PAYGRIX_BRIDGED_USDC_GENLAYER = "0x68da7D080094ddbf6B3fb4f57cC847D930452778" as const;

export type GenlayerBridgeStatus =
  | "idle"
  | "preparing"
  | "approval-required"
  | "waiting-approval"
  | "bridging"
  | "waiting-bridge-confirmation"
  | "cross-chain-pending"
  | "completed"
  | "error";

export const ERC20_ABI = [
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const PAYGRIX_BASE_ROUTER_ABI = [
  {
    name: "bridgeUSDC",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "genLayerRecipient", type: "address" },
    ],
    outputs: [{ name: "bridgeId", type: "bytes32" }],
  },
  {
    name: "TokensBridged",
    type: "event",
    inputs: [
      { indexed: true, name: "bridgeId", type: "bytes32" },
      { indexed: true, name: "sender", type: "address" },
      { indexed: true, name: "recipient", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
      { indexed: false, name: "nonce", type: "uint256" },
      { indexed: false, name: "sourceChainId", type: "uint256" },
      { indexed: false, name: "destinationChainId", type: "uint256" },
      { indexed: false, name: "timestamp", type: "uint256" },
    ],
  },
] as const;

export interface BridgeResult {
  bridgeId: string | null;
  approvalTxHash: string | null;
  bridgeTxHash: string | null;
  amountUSDC: string;
  recipient: string;
}

export function useGenlayerBridge() {
  const [status, setStatus] = useState<GenlayerBridgeStatus>("idle");
  const [approvalTxHash, setApprovalTxHash] = useState<string | null>(null);
  const [bridgeTxHash, setBridgeTxHash] = useState<string | null>(null);
  const [bridgeId, setBridgeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { address, chainId, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { switchChainAsync } = useSwitchChain();

  const resetState = useCallback(() => {
    setStatus("idle");
    setApprovalTxHash(null);
    setBridgeTxHash(null);
    setBridgeId(null);
    setError(null);
  }, []);

  const bridgeUSDCToGenlayer = useCallback(
    async ({
      amount,
      recipient,
    }: {
      amount: string;
      recipient: string;
    }) => {
      setError(null);
      setStatus("preparing");

      try {
        if (!isConnected || !address || !walletClient) {
          throw new Error("Please connect your EVM wallet.");
        }

        if (chainId === FORBIDDEN_CHAIN_ID) {
          throw new Error("Base Mainnet (8453) is prohibited. Please switch to Base Sepolia (84532).");
        }

        if (chainId !== BASE_SEPOLIA_CHAIN_ID) {
          try {
            await switchChainAsync({ chainId: BASE_SEPOLIA_CHAIN_ID });
          } catch {
            throw new Error("Please switch your network to Base Sepolia (Chain ID 84532) in your wallet.");
          }
        }

        if (!publicClient) {
          throw new Error("Public RPC client not available for Base Sepolia.");
        }

        // Validate Dynamic User Amount
        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
          throw new Error("Please enter a valid positive USDC amount.");
        }

        const decimalParts = amount.split(".");
        if (decimalParts.length > 1 && decimalParts[1].length > 6) {
          throw new Error("USDC amount cannot exceed 6 decimal places.");
        }

        const rawAmount = parseUnits(amount, 6);

        // Validate GenLayer Recipient Address
        const trimmedRecipient = recipient.trim();
        if (!trimmedRecipient || !isAddress(trimmedRecipient)) {
          throw new Error("Please provide a valid 0x recipient address on GenLayer Bradbury.");
        }

        // 1. Verify Connected Wallet USDC Balance on Base Sepolia
        const userUsdcBalance = (await publicClient.readContract({
          address: BASE_SEPOLIA_USDC,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [address],
        })) as bigint;

        if (userUsdcBalance < rawAmount) {
          throw new Error(
            `Insufficient Base Sepolia USDC balance. Required: ${amount} USDC, Available: ${(
              Number(userUsdcBalance) / 1e6
            ).toFixed(2)} USDC`
          );
        }

        // 2. Check and Execute Dynamic Approval (Only if allowance < rawAmount)
        const currentAllowance = (await publicClient.readContract({
          address: BASE_SEPOLIA_USDC,
          abi: ERC20_ABI,
          functionName: "allowance",
          args: [address, PAYGRIX_BRIDGE_VAULT_ADDRESS],
        })) as bigint;

        if (currentAllowance < rawAmount) {
          setStatus("approval-required");
          console.log(`[PayGrix Bridge] Requesting USDC approval of exact amount ${amount} (${rawAmount.toString()}) for Bridge Vault...`);

          const approveHash = await walletClient.writeContract({
            address: BASE_SEPOLIA_USDC,
            abi: ERC20_ABI,
            functionName: "approve",
            args: [PAYGRIX_BRIDGE_VAULT_ADDRESS, rawAmount],
          });

          setApprovalTxHash(approveHash);
          setStatus("waiting-approval");
          console.log(`[PayGrix Bridge] Waiting for approval confirmation: ${approveHash}`);

          const approvalReceipt = await publicClient.waitForTransactionReceipt({
            hash: approveHash,
            confirmations: 1,
          });

          if (approvalReceipt.status !== "success") {
            throw new Error("USDC approval transaction reverted on Base Sepolia.");
          }
          console.log("[PayGrix Bridge] USDC approval confirmed successfully.");
        }

        // 3. Pre-flight Static Simulation & Gas Estimation
        setStatus("bridging");
        console.log(`[PayGrix Bridge] Simulating bridge of ${amount} USDC to ${trimmedRecipient}...`);

        try {
          await publicClient.simulateContract({
            address: PAYGRIX_BASE_ROUTER_ADDRESS,
            abi: PAYGRIX_BASE_ROUTER_ABI,
            functionName: "bridgeUSDC",
            args: [rawAmount, trimmedRecipient as `0x${string}`],
            account: address,
          });
        } catch (simErr: unknown) {
          const simMessage = simErr instanceof Error ? simErr.message : String(simErr);
          console.error("[PayGrix Bridge Pre-flight Simulation Failed]:", simErr);
          throw new Error(`Bridge transaction pre-flight simulation reverted: ${simMessage.split("\n")[0]}`);
        }

        // 4. Execute Bridge Transaction on PayGrixBaseBridgeRouter
        console.log(`[PayGrix Bridge] Prompting wallet for bridgeUSDC(${amount} USDC)...`);
        const bridgeHash = await walletClient.writeContract({
          address: PAYGRIX_BASE_ROUTER_ADDRESS,
          abi: PAYGRIX_BASE_ROUTER_ABI,
          functionName: "bridgeUSDC",
          args: [rawAmount, trimmedRecipient as `0x${string}`],
        });

        setBridgeTxHash(bridgeHash);
        setStatus("waiting-bridge-confirmation");
        console.log(`[PayGrix Bridge] Waiting for Base Sepolia bridge confirmation: ${bridgeHash}`);

        const bridgeReceipt = await publicClient.waitForTransactionReceipt({
          hash: bridgeHash,
          confirmations: 1,
        });

        if (bridgeReceipt.status !== "success") {
          throw new Error("Bridge transaction reverted on Base Sepolia.");
        }

        // Extract bridgeId from TokensBridged event log
        let extractedBridgeId: string | null = null;
        for (const log of bridgeReceipt.logs) {
          try {
            const decoded = decodeEventLog({
              abi: PAYGRIX_BASE_ROUTER_ABI,
              data: log.data,
              topics: log.topics,
            });
            if (decoded.eventName === "TokensBridged" && decoded.args) {
              const args = decoded.args as { bridgeId: string };
              extractedBridgeId = args.bridgeId;
              break;
            }
          } catch {
            // Non-matching log entry
          }
        }

        if (extractedBridgeId) {
          setBridgeId(extractedBridgeId);
        }

        setStatus("completed");
        console.log(`[PayGrix Bridge] Bridge completed on Base Sepolia. Bridge ID: ${extractedBridgeId || bridgeHash}`);
      } catch (err: unknown) {
        console.error("[PayGrix Bridge Error]:", err);
        const errMsg = err instanceof Error ? err.message : String(err);

        if (errMsg.includes("User rejected") || errMsg.includes("user rejected") || errMsg.includes("User denied")) {
          setError("Transaction signature was rejected in your wallet.");
        } else if (errMsg.includes("insufficient funds") || errMsg.includes("gas required exceeds allowance")) {
          setError("Insufficient ETH on Base Sepolia for transaction gas.");
        } else {
          setError(errMsg.slice(0, 180));
        }
        setStatus("error");
      }
    },
    [address, chainId, isConnected, publicClient, switchChainAsync, walletClient]
  );

  return {
    status,
    approvalTxHash,
    bridgeTxHash,
    bridgeId,
    error,
    bridgeUSDCToGenlayer,
    resetState,
    isBaseSepolia: chainId === BASE_SEPOLIA_CHAIN_ID,
  };
}
