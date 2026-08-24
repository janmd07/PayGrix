import { createPublicClient, http, decodeEventLog } from "viem";
import { baseSepolia } from "viem/chains";
import * as dotenv from "dotenv";
dotenv.config({ path: "d:/arc-payout/.env" });

// eslint-disable-next-line @typescript-eslint/no-require-imports
const genlayer = require("d:/arc-payout/node_modules/genlayer-js");

export interface LiveRelayerConfig {
  baseRouterAddress: `0x${string}`;
  genlayerManagerAddress: `0x${string}`;
  genlayerTokenAddress: `0x${string}`;
  privateKey: string;
}

export class PayGrixLiveRelayer {
  private config: LiveRelayerConfig;
  private genClient: any;
  private viemPublicClient: any;
  private processedBridges: Set<string> = new Set();

  constructor(config: LiveRelayerConfig) {
    this.config = config;

    const rawKey = config.privateKey.startsWith("0x") ? config.privateKey : `0x${config.privateKey}`;
    const account = genlayer.createAccount(rawKey);

    this.genClient = genlayer.createClient({
      chain: genlayer.chains.testnetBradbury,
      account,
    });

    this.viemPublicClient = createPublicClient({
      chain: baseSepolia,
      transport: http("https://sepolia.base.org"),
    });
  }

  async processBaseBridgeTransaction(txHash: `0x${string}`): Promise<{
    genlayerTxHash: string;
    recipient: string;
    amount: bigint;
    bridgeId: string;
  }> {
    console.log(`[Relayer] Fetching Base Sepolia receipt for: ${txHash}...`);
    const receipt = await this.viemPublicClient.getTransactionReceipt({ hash: txHash });

    const TOKENS_BRIDGED_ABI = [
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

    let eventData: any = null;
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: TOKENS_BRIDGED_ABI,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName === "TokensBridged") {
          eventData = decoded.args;
          break;
        }
      } catch {
        // ignore non-matching logs
      }
    }

    if (!eventData) {
      throw new Error(`TokensBridged event not found in Base transaction: ${txHash}`);
    }

    const { bridgeId, sender, recipient, amount, nonce, sourceChainId, destinationChainId } = eventData;
    console.log(`[Relayer] Detected TokensBridged:`);
    console.log(`  Bridge ID:   ${bridgeId}`);
    console.log(`  Sender:      ${sender}`);
    console.log(`  Recipient:   ${recipient}`);
    console.log(`  Amount:      ${amount.toString()} (${(Number(amount) / 1e6).toFixed(6)} USDC)`);
    console.log(`  Source:      ${sourceChainId.toString()}`);
    console.log(`  Destination: ${destinationChainId.toString()}`);

    if (this.processedBridges.has(bridgeId)) {
      throw new Error(`Bridge ID ${bridgeId} has already been relayed.`);
    }

    console.log(`[Relayer] Broadcasting execute_inbound_mint to GenLayer Bradbury Manager (${this.config.genlayerManagerAddress})...`);

    const attester = this.genClient.account.address;

    const genTxHash = await this.genClient.writeContract({
      address: this.config.genlayerManagerAddress,
      functionName: "execute_inbound_mint",
      args: [
        bridgeId,
        sender,
        recipient,
        Number(amount),
        Number(nonce),
        Number(sourceChainId),
        Number(destinationChainId),
        this.config.baseRouterAddress,
        txHash,
        attester,
      ],
    });

    console.log(`[Relayer] GenLayer Inbound Mint TX Broadcasted: ${genTxHash}`);
    console.log(`[Relayer] Waiting for GenLayer Bradbury confirmation...`);

    const genReceipt = await this.genClient.waitForTransactionReceipt({ hash: genTxHash });
    console.log(`✓ [Relayer] GenLayer Transaction Finalized!`);
    console.log(`  Block Number: ${genReceipt.blockNumber}`);
    console.log(`  Status:       ${genReceipt.status}`);

    this.processedBridges.add(bridgeId);

    return {
      genlayerTxHash: genTxHash,
      recipient,
      amount,
      bridgeId,
    };
  }

  async getRecipientBalance(recipientAddress: string): Promise<bigint> {
    const balance = await this.genClient.readContract({
      address: this.config.genlayerTokenAddress,
      functionName: "balance_of",
      args: [recipientAddress],
    });
    return BigInt(balance);
  }
}
