import {
  decodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  getAddress,
  isAddress,
  pad,
  parseUnits,
  toEventSelector,
  toFunctionSelector,
} from "viem";
import {
  CCTP_V2_MESSAGE_TRANSMITTER,
  CCTP_V2_TOKEN_MESSENGER,
  CIRCLE_IRIS_PRODUCTION_API,
  resolveMainnetCctpRoute,
} from "@/config/cctp-mainnet";

// -----------------------------------------------------------------------------
// ABIs & Selectors
// -----------------------------------------------------------------------------
export const tokenMessengerV2Abi = [
  {
    name: "depositForBurn",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "destinationDomain", type: "uint32" },
      { name: "mintRecipient", type: "bytes32" },
      { name: "burnToken", type: "address" },
    ],
    outputs: [{ name: "_nonce", type: "uint64" }],
  },
] as const;

export const messageTransmitterV2Abi = [
  {
    name: "receiveMessage",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "message", type: "bytes" },
      { name: "attestation", type: "bytes" },
    ],
    outputs: [{ name: "success", type: "bool" }],
  },
  {
    name: "MessageSent",
    type: "event",
    inputs: [{ name: "message", type: "bytes", indexed: false }],
  },
] as const;

export const MESSAGE_SENT_EVENT_TOPIC0 = toEventSelector(
  "event MessageSent(bytes message)"
);

export const DEPOSIT_FOR_BURN_SELECTOR = toFunctionSelector(
  "function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken) returns (uint64)"
);

export const RECEIVE_MESSAGE_SELECTOR = toFunctionSelector(
  "function receiveMessage(bytes message, bytes attestation) returns (bool)"
);

// -----------------------------------------------------------------------------
// Recipient & Address Helpers
// -----------------------------------------------------------------------------
export function padAddressToBytes32(address: string): `0x${string}` {
  const clean = address.trim();
  if (!isAddress(clean)) {
    throw new Error(`Invalid EVM address for recipient: "${address}"`);
  }
  const checksummed = getAddress(clean);
  return pad(checksummed as `0x${string}`, { size: 32, dir: "left" });
}

export function bytes32ToAddress(bytes32: `0x${string}`): `0x${string}` {
  if (!bytes32.startsWith("0x") || bytes32.length !== 66) {
    throw new Error(`Invalid bytes32 hex: ${bytes32}`);
  }
  const rawAddr = `0x${bytes32.slice(26)}`;
  return getAddress(rawAddr);
}

// -----------------------------------------------------------------------------
// Amount Validation
// -----------------------------------------------------------------------------
export function parseAndValidateUsdcAmount(amountStr: string): bigint {
  const trimmed = amountStr.trim();
  if (!trimmed || isNaN(Number(trimmed))) {
    throw new Error("Invalid USDC amount: must be a valid numeric string.");
  }
  const parsedFloat = parseFloat(trimmed);
  if (parsedFloat <= 0) {
    throw new Error("Invalid USDC amount: must be greater than 0.");
  }
  if (parsedFloat < 0.01) {
    throw new Error("USDC amount is below the minimum threshold (0.01 USDC).");
  }

  // Parse exact 6 decimals
  const amountBigInt = parseUnits(trimmed, 6);
  if (amountBigInt <= BigInt(0)) {
    throw new Error("USDC amount parsed to zero or negative value.");
  }
  return amountBigInt;
}

// -----------------------------------------------------------------------------
// Calldata Encoders
// -----------------------------------------------------------------------------
export function encodeErc20ApprovalCalldata(
  spender: `0x${string}`,
  amount: bigint
): `0x${string}` {
  return encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [spender, amount],
  });
}

export function encodeDepositForBurnCalldata(params: {
  amount: bigint;
  destinationDomain: number;
  mintRecipientBytes32: `0x${string}`;
  burnToken: `0x${string}`;
}): `0x${string}` {
  return encodeFunctionData({
    abi: tokenMessengerV2Abi,
    functionName: "depositForBurn",
    args: [
      params.amount,
      params.destinationDomain,
      params.mintRecipientBytes32,
      params.burnToken,
    ],
  });
}

export function encodeReceiveMessageCalldata(params: {
  message: `0x${string}`;
  attestation: `0x${string}`;
}): `0x${string}` {
  return encodeFunctionData({
    abi: messageTransmitterV2Abi,
    functionName: "receiveMessage",
    args: [params.message, params.attestation],
  });
}

// -----------------------------------------------------------------------------
// Message Extraction & Decoding
// -----------------------------------------------------------------------------
export interface DecodedCctpMessage {
  version: number;
  sourceDomain: number;
  destinationDomain: number;
  nonce: bigint;
  sender: `0x${string}`;
  recipient: `0x${string}`;
  destinationCaller: `0x${string}`;
  messageBodyVersion: number;
  burnToken: `0x${string}`;
  mintRecipient: `0x${string}`;
  amount: bigint;
  messageSender: `0x${string}`;
  rawMessage: `0x${string}`;
}

export function extractMessageFromReceiptLogs(receipt: {
  logs?: Array<{ address: string; topics: string[]; data: string }>;
}): `0x${string}` {
  if (!receipt.logs || !Array.isArray(receipt.logs) || receipt.logs.length === 0) {
    throw new Error("No logs found in transaction receipt.");
  }

  const messageLog = receipt.logs.find(
    (log) =>
      log.topics &&
      log.topics[0]?.toLowerCase() === MESSAGE_SENT_EVENT_TOPIC0.toLowerCase()
  );

  if (!messageLog) {
    throw new Error("MessageSent event log not found in transaction receipt.");
  }

  // The MessageSent event has a single non-indexed parameter `bytes message`.
  // Its data contains standard ABI-encoded dynamic bytes.
  try {
    const decoded = decodeAbiParameters(
      [{ type: "bytes" }],
      messageLog.data as `0x${string}`
    );
    const rawMsg = decoded[0] as `0x${string}`;
    if (!rawMsg || rawMsg === "0x") {
      throw new Error("Extracted MessageSent payload is empty.");
    }
    return rawMsg;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to decode MessageSent event data: ${msg}`);
  }
}

export function decodeCctpMessage(messageHex: `0x${string}`): DecodedCctpMessage {
  if (!messageHex.startsWith("0x")) {
    throw new Error("CCTP message hex must start with 0x.");
  }
  const rawBytes = messageHex.slice(2);
  const totalLengthBytes = rawBytes.length / 2;

  // Header = 116 bytes, BurnMessage = 132 bytes -> Total minimum = 248 bytes
  if (totalLengthBytes < 248) {
    throw new Error(
      `CCTP message is too short: expected at least 248 bytes, got ${totalLengthBytes} bytes.`
    );
  }

  const getSub = (startByte: number, endByte: number): string =>
    rawBytes.slice(startByte * 2, endByte * 2);

  const version = parseInt(getSub(0, 4), 16);
  const sourceDomain = parseInt(getSub(4, 8), 16);
  const destinationDomain = parseInt(getSub(8, 12), 16);
  const nonce = BigInt(`0x${getSub(12, 20)}`);
  const sender = `0x${getSub(20, 52)}` as `0x${string}`;
  const recipient = `0x${getSub(52, 84)}` as `0x${string}`;
  const destinationCaller = `0x${getSub(84, 116)}` as `0x${string}`;

  // Body offsets
  const messageBodyVersion = parseInt(getSub(116, 120), 16);
  const burnToken = `0x${getSub(120, 152)}` as `0x${string}`;
  const mintRecipient = `0x${getSub(152, 184)}` as `0x${string}`;
  const amount = BigInt(`0x${getSub(184, 216)}`);
  const messageSender = `0x${getSub(216, 248)}` as `0x${string}`;

  return {
    version,
    sourceDomain,
    destinationDomain,
    nonce,
    sender,
    recipient,
    destinationCaller,
    messageBodyVersion,
    burnToken,
    mintRecipient,
    amount,
    messageSender,
    rawMessage: messageHex,
  };
}

export function validateDecodedMessage(params: {
  decoded: DecodedCctpMessage;
  expectedSourceDomain: number;
  expectedDestinationDomain: number;
  expectedAmount: bigint;
  expectedBurnToken: `0x${string}`;
  expectedMintRecipientBytes32: `0x${string}`;
}): void {
  const {
    decoded,
    expectedSourceDomain,
    expectedDestinationDomain,
    expectedAmount,
    expectedBurnToken,
    expectedMintRecipientBytes32,
  } = params;

  if (decoded.sourceDomain !== expectedSourceDomain) {
    throw new Error(
      `Security check failed: Message source domain mismatch. Expected ${expectedSourceDomain}, got ${decoded.sourceDomain}.`
    );
  }

  if (decoded.destinationDomain !== expectedDestinationDomain) {
    throw new Error(
      `Security check failed: Message destination domain mismatch. Expected ${expectedDestinationDomain}, got ${decoded.destinationDomain}.`
    );
  }

  if (decoded.amount !== expectedAmount) {
    throw new Error(
      `Security check failed: Message amount mismatch. Expected ${expectedAmount}, got ${decoded.amount}.`
    );
  }

  const expectedBurnTokenBytes32 = padAddressToBytes32(expectedBurnToken);
  if (decoded.burnToken.toLowerCase() !== expectedBurnTokenBytes32.toLowerCase()) {
    throw new Error(
      `Security check failed: Burn token mismatch. Expected ${expectedBurnTokenBytes32}, got ${decoded.burnToken}.`
    );
  }

  if (
    decoded.mintRecipient.toLowerCase() !==
    expectedMintRecipientBytes32.toLowerCase()
  ) {
    throw new Error(
      `Security check failed: Mint recipient mismatch. Expected ${expectedMintRecipientBytes32}, got ${decoded.mintRecipient}.`
    );
  }
}

// -----------------------------------------------------------------------------
// Iris Attestation Polling
// -----------------------------------------------------------------------------
export interface IrisAttestationMessage {
  attestation?: string;
  message?: string;
  status: "pending" | "complete" | string;
  error?: string;
}

export interface IrisAttestationResponse {
  messages?: IrisAttestationMessage[];
  error?: string;
}

export async function pollCircleIrisAttestation(params: {
  sourceDomain: number;
  transactionHash: `0x${string}`;
  apiBaseUrl?: string;
  maxAttempts?: number;
  intervalMs?: number;
  signal?: AbortSignal;
  onAttempt?: (attempt: number, max: number, status?: string) => void;
}): Promise<{ message: `0x${string}`; attestation: `0x${string}` }> {
  const {
    sourceDomain,
    transactionHash,
    apiBaseUrl = CIRCLE_IRIS_PRODUCTION_API,
    maxAttempts = 60, // 60 attempts * 5s = 5 minutes timeout
    intervalMs = 5000,
    signal,
    onAttempt,
  } = params;

  const url = `${apiBaseUrl}/v2/messages/${sourceDomain}?transactionHash=${transactionHash}`;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) {
      throw new Error("Circle attestation polling aborted.");
    }

    try {
      const res = await fetch(url, { signal });
      if (res.ok) {
        const data = (await res.json()) as IrisAttestationResponse;
        const firstMsg = data.messages?.[0];

        onAttempt?.(attempt, maxAttempts, firstMsg?.status || "fetching");

        if (
          firstMsg &&
          firstMsg.status === "complete" &&
          firstMsg.attestation &&
          firstMsg.attestation.startsWith("0x") &&
          firstMsg.attestation !== "0x"
        ) {
          return {
            message: (firstMsg.message || "0x") as `0x${string}`,
            attestation: firstMsg.attestation as `0x${string}`,
          };
        }
      } else if (res.status === 404) {
        // Message not yet indexed by Iris, continue polling
        onAttempt?.(attempt, maxAttempts, "indexing");
      } else {
        const errorText = await res.text().catch(() => "");
        console.warn(
          `[CCTP Mainnet] Iris API non-200 status (${res.status}): ${errorText}`
        );
        onAttempt?.(attempt, maxAttempts, `http-${res.status}`);
      }
    } catch (err: unknown) {
      if (signal?.aborted) {
        throw new Error("Circle attestation polling aborted.");
      }
      console.warn(`[CCTP Mainnet] Transient Iris polling error:`, err);
    }

    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  throw new Error(
    `Timed out waiting for Circle CCTP attestation completion after ${maxAttempts} attempts. ` +
      `Your funds were burned on the source chain (${transactionHash}). ` +
      `You can re-query or complete the destination mint once Iris marks the transaction complete.`
  );
}

// -----------------------------------------------------------------------------
// On-Chain Deployment Bytecode Verification
// -----------------------------------------------------------------------------
export interface CodeVerificationClient {
  getBytecode: (args: { address: `0x${string}` }) => Promise<`0x${string}` | undefined>;
}

export async function verifyCctpDeploymentBytecode(params: {
  client: CodeVerificationClient;
  tokenMessengerAddress?: `0x${string}`;
  messageTransmitterAddress?: `0x${string}`;
  usdcAddress?: `0x${string}`;
}): Promise<{
  tokenMessengerOk: boolean;
  messageTransmitterOk: boolean;
  usdcOk: boolean;
}> {
  const {
    client,
    tokenMessengerAddress = CCTP_V2_TOKEN_MESSENGER,
    messageTransmitterAddress = CCTP_V2_MESSAGE_TRANSMITTER,
    usdcAddress,
  } = params;

  const tmCode = await client.getBytecode({ address: tokenMessengerAddress });
  const mtCode = await client.getBytecode({ address: messageTransmitterAddress });
  const usdcCode = usdcAddress
    ? await client.getBytecode({ address: usdcAddress })
    : undefined;

  const isContract = (code?: string) => Boolean(code && code !== "0x" && code.length > 2);

  return {
    tokenMessengerOk: isContract(tmCode),
    messageTransmitterOk: isContract(mtCode),
    usdcOk: usdcAddress ? isContract(usdcCode) : true,
  };
}

// -----------------------------------------------------------------------------
// Core Pure Execution Pipeline
// -----------------------------------------------------------------------------
export type MainnetBridgeStage =
  | "idle"
  | "approving"
  | "burning"
  | "attesting"
  | "waiting-destination-wallet"
  | "minting"
  | "verifying"
  | "complete"
  | "failed";

export interface MainnetBridgeEngineParams {
  sourceChain: string;
  destinationChain: string;
  amount: string;
  recipientAddress: `0x${string}`;
  sourceWalletClient: {
    writeContract: (args: {
      address: `0x${string}`;
      abi: readonly unknown[];
      functionName: string;
      args: readonly unknown[];
    }) => Promise<`0x${string}`>;
  };
  sourcePublicClient: {
    readContract: (args: {
      address: `0x${string}`;
      abi: readonly unknown[];
      functionName: string;
      args: readonly unknown[];
    }) => Promise<unknown>;
    waitForTransactionReceipt: (args: {
      hash: `0x${string}`;
      timeout?: number;
    }) => Promise<{
      status: "success" | "reverted" | string;
      logs: Array<{ address: string; topics: string[]; data: string }>;
    }>;
    getBytecode: (args: { address: `0x${string}` }) => Promise<`0x${string}` | undefined>;
  };
  destinationWalletClient: {
    writeContract: (args: {
      address: `0x${string}`;
      abi: readonly unknown[];
      functionName: string;
      args: readonly unknown[];
    }) => Promise<`0x${string}`>;
  };
  destinationPublicClient: {
    readContract: (args: {
      address: `0x${string}`;
      abi: readonly unknown[];
      functionName: string;
      args: readonly unknown[];
    }) => Promise<unknown>;
    waitForTransactionReceipt: (args: {
      hash: `0x${string}`;
      timeout?: number;
    }) => Promise<{
      status: "success" | "reverted" | string;
    }>;
    getBytecode: (args: { address: `0x${string}` }) => Promise<`0x${string}` | undefined>;
  };
  senderAddress: `0x${string}`;
  onStageChange?: (stage: MainnetBridgeStage) => void;
  onTxSent?: (type: "approve" | "burn" | "mint", hash: `0x${string}`) => void;
  signal?: AbortSignal;
  irisApiBaseUrl?: string;
}

export interface MainnetBridgeExecutionResult {
  success: boolean;
  stage: MainnetBridgeStage;
  approvalTxHash?: `0x${string}`;
  burnTxHash?: `0x${string}`;
  mintTxHash?: `0x${string}`;
  messageHex?: `0x${string}`;
  attestationHex?: `0x${string}`;
  error?: string;
  sourceBalanceBefore?: bigint;
  destinationBalanceBefore?: bigint;
  destinationBalanceAfter?: bigint;
}

export async function executeMainnetCctpBridge(
  params: MainnetBridgeEngineParams
): Promise<MainnetBridgeExecutionResult> {
  const {
    sourceChain,
    destinationChain,
    amount,
    recipientAddress,
    sourceWalletClient,
    sourcePublicClient,
    destinationWalletClient,
    destinationPublicClient,
    senderAddress,
    onStageChange,
    onTxSent,
    signal,
    irisApiBaseUrl,
  } = params;

  const setStage = (s: MainnetBridgeStage) => {
    onStageChange?.(s);
  };

  let approvalTxHash: `0x${string}` | undefined;
  let burnTxHash: `0x${string}` | undefined;
  let mintTxHash: `0x${string}` | undefined;
  let messageHex: `0x${string}` | undefined;
  let attestationHex: `0x${string}` | undefined;
  let destBalanceBefore = BigInt(0);

  try {
    if (signal?.aborted) throw new Error("Bridge execution aborted.");

    // 1. Route validation
    const route = resolveMainnetCctpRoute(sourceChain, destinationChain);
    if (!route.enabled) {
      throw new Error(
        route.disabledReason ||
          `Bridge route ${sourceChain} -> ${destinationChain} is not enabled for execution.`
      );
    }

    // 2. Amount parsing & validation
    const parsedAmount = parseAndValidateUsdcAmount(amount);

    // 3. Recipient validation & formatting
    const recipientBytes32 = padAddressToBytes32(recipientAddress);

    // 4. On-Chain deployment bytecode verification
    const [sourceDeployCheck, destDeployCheck] = await Promise.all([
      verifyCctpDeploymentBytecode({
        client: sourcePublicClient,
        tokenMessengerAddress: route.sourceTokenMessenger,
        usdcAddress: route.sourceUsdc,
      }),
      verifyCctpDeploymentBytecode({
        client: destinationPublicClient,
        messageTransmitterAddress: route.destinationMessageTransmitter,
        usdcAddress: route.destinationUsdc,
      }),
    ]);

    if (!sourceDeployCheck.tokenMessengerOk || !sourceDeployCheck.usdcOk) {
      throw new Error(
        `On-chain contract verification failed on ${sourceChain}: TokenMessenger or USDC bytecode not found.`
      );
    }
    if (!destDeployCheck.messageTransmitterOk || !destDeployCheck.usdcOk) {
      throw new Error(
        `On-chain contract verification failed on ${destinationChain}: MessageTransmitter or USDC bytecode not found.`
      );
    }

    // 5. Check source USDC balance
    const sourceBalanceRaw = (await sourcePublicClient.readContract({
      address: route.sourceUsdc,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [senderAddress],
    })) as bigint;

    if (sourceBalanceRaw < parsedAmount) {
      throw new Error(
        `Insufficient USDC balance on ${sourceChain}. Required: ${amount} USDC.`
      );
    }

    // 6. Snapshot destination USDC balance before transfer
    destBalanceBefore = (await destinationPublicClient.readContract({
      address: route.destinationUsdc,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [recipientAddress],
    })) as bigint;

    if (signal?.aborted) throw new Error("Bridge execution aborted.");

    // 7. Check & execute allowance for TokenMessengerV2
    const currentAllowance = (await sourcePublicClient.readContract({
      address: route.sourceUsdc,
      abi: erc20Abi,
      functionName: "allowance",
      args: [senderAddress, route.sourceTokenMessenger],
    })) as bigint;

    if (currentAllowance < parsedAmount) {
      setStage("approving");

      approvalTxHash = await sourceWalletClient.writeContract({
        address: route.sourceUsdc,
        abi: erc20Abi,
        functionName: "approve",
        args: [route.sourceTokenMessenger, parsedAmount],
      });
      onTxSent?.("approve", approvalTxHash);

      const approveReceipt = await sourcePublicClient.waitForTransactionReceipt({
        hash: approvalTxHash,
        timeout: 60000,
      });

      if (approveReceipt.status !== "success") {
        throw new Error("USDC approval transaction reverted on-chain.");
      }

      // Re-read allowance to ensure it is sufficient
      const updatedAllowance = (await sourcePublicClient.readContract({
        address: route.sourceUsdc,
        abi: erc20Abi,
        functionName: "allowance",
        args: [senderAddress, route.sourceTokenMessenger],
      })) as bigint;

      if (updatedAllowance < parsedAmount) {
        throw new Error(
          "USDC allowance remains insufficient after approval transaction."
        );
      }
    }

    if (signal?.aborted) throw new Error("Bridge execution aborted.");

    // 8. Execute depositForBurn on source TokenMessengerV2
    setStage("burning");

    burnTxHash = await sourceWalletClient.writeContract({
      address: route.sourceTokenMessenger,
      abi: tokenMessengerV2Abi,
      functionName: "depositForBurn",
      args: [
        parsedAmount,
        route.destinationDomain,
        recipientBytes32,
        route.sourceUsdc,
      ],
    });
    onTxSent?.("burn", burnTxHash);

    const burnReceipt = await sourcePublicClient.waitForTransactionReceipt({
      hash: burnTxHash,
      timeout: 120000,
    });

    if (burnReceipt.status !== "success") {
      throw new Error("depositForBurn transaction reverted on source chain.");
    }

    // 9. Extract and validate MessageSent log from source receipt
    messageHex = extractMessageFromReceiptLogs(burnReceipt);
    const decodedMessage = decodeCctpMessage(messageHex);

    validateDecodedMessage({
      decoded: decodedMessage,
      expectedSourceDomain: route.sourceDomain,
      expectedDestinationDomain: route.destinationDomain,
      expectedAmount: parsedAmount,
      expectedBurnToken: route.sourceUsdc,
      expectedMintRecipientBytes32: recipientBytes32,
    });

    if (signal?.aborted) throw new Error("Bridge execution aborted.");

    // 10. Poll Circle Production Iris Attestation
    setStage("attesting");

    const attestationRes = await pollCircleIrisAttestation({
      sourceDomain: route.sourceDomain,
      transactionHash: burnTxHash,
      apiBaseUrl: irisApiBaseUrl,
      signal,
    });

    attestationHex = attestationRes.attestation;
    if (attestationRes.message && attestationRes.message !== "0x") {
      messageHex = attestationRes.message;
    }

    if (signal?.aborted) throw new Error("Bridge execution aborted.");

    // 11. Execute receiveMessage on destination MessageTransmitterV2
    setStage("minting");

    mintTxHash = await destinationWalletClient.writeContract({
      address: route.destinationMessageTransmitter,
      abi: messageTransmitterV2Abi,
      functionName: "receiveMessage",
      args: [messageHex, attestationHex],
    });
    onTxSent?.("mint", mintTxHash);

    const mintReceipt = await destinationPublicClient.waitForTransactionReceipt({
      hash: mintTxHash,
      timeout: 120000,
    });

    if (mintReceipt.status !== "success") {
      throw new Error("receiveMessage transaction reverted on destination chain.");
    }

    if (signal?.aborted) throw new Error("Bridge execution aborted.");

    // 12. Destination balance verification
    setStage("verifying");

    const destBalanceAfter = (await destinationPublicClient.readContract({
      address: route.destinationUsdc,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [recipientAddress],
    })) as bigint;

    if (destBalanceAfter < destBalanceBefore + parsedAmount) {
      throw new Error(
        `Destination balance verification failed. Expected at least ${destBalanceBefore + parsedAmount}, got ${destBalanceAfter}.`
      );
    }

    // 13. Bridge completed successfully
    setStage("complete");

    return {
      success: true,
      stage: "complete",
      approvalTxHash,
      burnTxHash,
      mintTxHash,
      messageHex,
      attestationHex,
      sourceBalanceBefore: sourceBalanceRaw,
      destinationBalanceBefore: destBalanceBefore,
      destinationBalanceAfter: destBalanceAfter,
    };
  } catch (err: unknown) {
    setStage("failed");
    const errMsg = err instanceof Error ? err.message : "Bridge execution failed.";
    return {
      success: false,
      stage: "failed",
      approvalTxHash,
      burnTxHash,
      mintTxHash,
      messageHex,
      attestationHex,
      error: errMsg,
      destinationBalanceBefore: destBalanceBefore,
    };
  }
}
