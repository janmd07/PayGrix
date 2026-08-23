"use client";

import { useState, useCallback } from "react";
import { useAccount, useWalletClient, usePublicClient, useSwitchChain } from "wagmi";
import { isAddress, parseUnits, decodeEventLog } from "viem";

export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const FORBIDDEN_CHAIN_ID = 8453; // Base Mainnet
export const BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
export const PAYGRIX_ESCROW_VAULT_ADDRESS = "0xDF14c0cCd803866A54202B83c44C98Ab496561B8" as const;
export const BASE_BRIDGE_ADAPTER_ADDRESS = "0xD9e1Cde11f6AF114e01726DA2cf007a27aB6314e" as const;
export const GENLAYER_BRADBURY_RESOLVER = "0xA314b6402477561d9a1650142724724F60f92534" as const;

export type GenlayerEscrowStatus =
  | "idle"
  | "preparing"
  | "approval-required"
  | "waiting-approval"
  | "creating-escrow"
  | "waiting-escrow"
  | "funding-escrow"
  | "waiting-funding"
  | "escrow-created"
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

export const PAYGRIX_ESCROW_VAULT_ABI = [
  {
    name: "createEscrow",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "beneficiary", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "durationSeconds", type: "uint256" },
    ],
    outputs: [{ name: "escrowId", type: "bytes32" }],
  },
  {
    name: "fundEscrow",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "escrowId", type: "bytes32" }],
    outputs: [],
  },
  {
    name: "EscrowCreated",
    type: "event",
    inputs: [
      { indexed: true, name: "escrowId", type: "bytes32" },
      { indexed: true, name: "depositor", type: "address" },
      { indexed: true, name: "beneficiary", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
      { indexed: false, name: "expirationTimestamp", type: "uint256" },
    ],
  },
  {
    name: "EscrowFunded",
    type: "event",
    inputs: [
      { indexed: true, name: "escrowId", type: "bytes32" },
      { indexed: false, name: "amount", type: "uint256" },
    ],
  },
] as const;

export interface EscrowResult {
  escrowId: string | null;
  approvalTxHash: string | null;
  createTxHash: string | null;
  fundTxHash: string | null;
  amountUSDC: string;
  beneficiary: string;
}

export function useGenlayerEscrow() {
  const [status, setStatus] = useState<GenlayerEscrowStatus>("idle");
  const [approvalTxHash, setApprovalTxHash] = useState<string | null>(null);
  const [createTxHash, setCreateTxHash] = useState<string | null>(null);
  const [fundTxHash, setFundTxHash] = useState<string | null>(null);
  const [escrowId, setEscrowId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { address, chainId, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { switchChainAsync } = useSwitchChain();

  const resetState = useCallback(() => {
    setStatus("idle");
    setApprovalTxHash(null);
    setCreateTxHash(null);
    setFundTxHash(null);
    setEscrowId(null);
    setError(null);
  }, []);

  const createAndFundEscrow = useCallback(
    async ({
      amount,
      beneficiary,
      durationSeconds = 3600,
    }: {
      amount: string;
      beneficiary: string;
      durationSeconds?: number;
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

        // Validate Amount
        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
          throw new Error("Please enter a valid positive USDC amount.");
        }
        const decimalParts = amount.split(".");
        if (decimalParts.length > 1 && decimalParts[1].length > 6) {
          throw new Error("USDC amount cannot exceed 6 decimal places.");
        }
        const rawAmount = parseUnits(amount, 6);

        // Validate Beneficiary Address
        const trimmedBeneficiary = beneficiary.trim();
        if (!trimmedBeneficiary || !isAddress(trimmedBeneficiary)) {
          throw new Error("Please provide a valid 0x recipient/beneficiary EVM address.");
        }

        if (trimmedBeneficiary.toLowerCase() === address.toLowerCase()) {
          throw new Error("Beneficiary address cannot be the same as your depositor wallet.");
        }

        if (durationSeconds < 300) {
          throw new Error("Escrow duration must be at least 300 seconds (5 minutes).");
        }

        // 1. Verify User USDC Balance
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

        // 2. Check Allowance
        const currentAllowance = (await publicClient.readContract({
          address: BASE_SEPOLIA_USDC,
          abi: ERC20_ABI,
          functionName: "allowance",
          args: [address, PAYGRIX_ESCROW_VAULT_ADDRESS],
        })) as bigint;

        if (currentAllowance < rawAmount) {
          setStatus("approval-required");
          console.log("[GenLayer Escrow] Requesting USDC approval for PayGrixEscrowVault...");
          
          const approveHash = await walletClient.writeContract({
            address: BASE_SEPOLIA_USDC,
            abi: ERC20_ABI,
            functionName: "approve",
            args: [PAYGRIX_ESCROW_VAULT_ADDRESS, rawAmount],
          });

          setApprovalTxHash(approveHash);
          setStatus("waiting-approval");
          console.log(`[GenLayer Escrow] Waiting for approval confirmation: ${approveHash}`);

          const approvalReceipt = await publicClient.waitForTransactionReceipt({
            hash: approveHash,
            confirmations: 1,
          });

          if (approvalReceipt.status !== "success") {
            throw new Error("USDC approval transaction reverted on Base Sepolia.");
          }
          console.log("[GenLayer Escrow] USDC approval confirmed successfully.");
        }

        // 3. Create Escrow on PayGrixEscrowVault
        setStatus("creating-escrow");
        console.log(`[GenLayer Escrow] Calling createEscrow on ${PAYGRIX_ESCROW_VAULT_ADDRESS}...`);

        const createHash = await walletClient.writeContract({
          address: PAYGRIX_ESCROW_VAULT_ADDRESS,
          abi: PAYGRIX_ESCROW_VAULT_ABI,
          functionName: "createEscrow",
          args: [trimmedBeneficiary as `0x${string}`, rawAmount, BigInt(durationSeconds)],
        });

        setCreateTxHash(createHash);
        setStatus("waiting-escrow");
        console.log(`[GenLayer Escrow] Waiting for createEscrow confirmation: ${createHash}`);

        const createReceipt = await publicClient.waitForTransactionReceipt({
          hash: createHash,
          confirmations: 1,
        });

        if (createReceipt.status !== "success") {
          throw new Error("PayGrixEscrowVault.createEscrow transaction reverted on Base Sepolia.");
        }

        // Extract escrowId from EscrowCreated event log
        let extractedEscrowId: string | null = null;
        for (const log of createReceipt.logs) {
          try {
            const decoded = decodeEventLog({
              abi: PAYGRIX_ESCROW_VAULT_ABI,
              data: log.data,
              topics: log.topics,
            });
            if (decoded.eventName === "EscrowCreated" && decoded.args) {
              const args = decoded.args as { escrowId: string };
              extractedEscrowId = args.escrowId;
              break;
            }
          } catch {
            // Non-matching log entry
          }
        }

        if (!extractedEscrowId) {
          console.warn("[GenLayer Escrow] Could not decode EscrowCreated log, using transaction fallback.");
        } else {
          setEscrowId(extractedEscrowId);
        }

        // 4. Fund Escrow (if escrowId decoded)
        if (extractedEscrowId) {
          setStatus("funding-escrow");
          console.log(`[GenLayer Escrow] Funding escrow ${extractedEscrowId}...`);

          const fundHash = await walletClient.writeContract({
            address: PAYGRIX_ESCROW_VAULT_ADDRESS,
            abi: PAYGRIX_ESCROW_VAULT_ABI,
            functionName: "fundEscrow",
            args: [extractedEscrowId as `0x${string}`],
          });

          setFundTxHash(fundHash);
          setStatus("waiting-funding");
          console.log(`[GenLayer Escrow] Waiting for fundEscrow confirmation: ${fundHash}`);

          const fundReceipt = await publicClient.waitForTransactionReceipt({
            hash: fundHash,
            confirmations: 1,
          });

          if (fundReceipt.status !== "success") {
            throw new Error("PayGrixEscrowVault.fundEscrow transaction reverted on Base Sepolia.");
          }
          console.log("[GenLayer Escrow] Escrow funded successfully!");
        }

        setStatus("escrow-created");
      } catch (err: unknown) {
        console.error("[GenLayer Escrow Error]:", err);
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
    createTxHash,
    fundTxHash,
    escrowId,
    error,
    createAndFundEscrow,
    resetState,
    isBaseSepolia: chainId === BASE_SEPOLIA_CHAIN_ID,
  };
}
