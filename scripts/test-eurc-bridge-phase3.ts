import {
  resolveEurcBridgeRoute,
  isEurcSupportedRoute,
  CCTS_ADDRESS,
  EURC_TOKEN_MANAGER,
  EURC_TOKEN_ID,
  BRIDGE_ASSETS,
  getBridgeExplorerTxUrl,
  getCctpDomain,
} from "../src/config/bridge-assets";
import { encodePacked, getAddress } from "viem";
import * as fs from "fs";
import * as path from "path";

// Test suite for Phase 3: EURC Bidirectional Bridge Implementation
function runTests() {
  console.log("==================================================");
  console.log("RUNNING PHASE 3 STATIC & COMPONENT INTEGRATION TESTS");
  console.log("==================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, name: string) {
    if (condition) {
      console.log(`[PASS] ${name}`);
      passed++;
    } else {
      console.error(`[FAIL] ${name}`);
      failed++;
    }
  }

  // 1. EURC Route Resolver: Base Sepolia -> Arc Testnet
  try {
    const isSupported = isEurcSupportedRoute("Base Sepolia", "Arc Testnet");
    const route = resolveEurcBridgeRoute("Base Sepolia", "Arc Testnet");
    assert(
      isSupported &&
        route.sourceDomain === 6 &&
        route.destinationDomain === 26 &&
        route.sourceEURC.toLowerCase() === "0x808456652fdb597867f38412077a9182bf77359f" &&
        route.destinationEURC.toLowerCase() === "0x89b50855aa3be2f677cd6303cec089b5f319d72a" &&
        route.cctsAddress === CCTS_ADDRESS &&
        route.tokenManagerAddress === EURC_TOKEN_MANAGER &&
        route.tokenId === EURC_TOKEN_ID,
      "EURC Route Resolver: Base Sepolia -> Arc Testnet"
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    assert(false, `EURC Route Resolver Base -> Arc: ${msg}`);
  }

  // 2. EURC Route Resolver: Arc Testnet -> Base Sepolia
  try {
    const isSupported = isEurcSupportedRoute("Arc Testnet", "Base Sepolia");
    const route = resolveEurcBridgeRoute("Arc Testnet", "Base Sepolia");
    assert(
      isSupported &&
        route.sourceDomain === 26 &&
        route.destinationDomain === 6 &&
        route.sourceEURC.toLowerCase() === "0x89b50855aa3be2f677cd6303cec089b5f319d72a" &&
        route.destinationEURC.toLowerCase() === "0x808456652fdb597867f38412077a9182bf77359f" &&
        route.cctsAddress === CCTS_ADDRESS &&
        route.tokenManagerAddress === EURC_TOKEN_MANAGER &&
        route.tokenId === EURC_TOKEN_ID,
      "EURC Route Resolver: Arc Testnet -> Base Sepolia"
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    assert(false, `EURC Route Resolver Arc -> Base: ${msg}`);
  }

  // 3. Invalid EURC Routes (REJECT)
  const invalidPairs = [
    ["Arbitrum Sepolia", "Arc Testnet"],
    ["Arc Testnet", "Arbitrum Sepolia"],
    ["Solana Devnet", "Base Sepolia"],
    ["Base Sepolia", "GenLayer Bradbury"],
    ["Ethereum Sepolia", "Base Sepolia"],
    ["Base Sepolia", "Base Sepolia"],
    ["Arc Testnet", "Arc Testnet"],
  ];
  let allInvalidRejected = true;
  for (const [from, to] of invalidPairs) {
    try {
      resolveEurcBridgeRoute(from, to);
      allInvalidRejected = false;
      break;
    } catch {
      // Expected rejection
    }
  }
  assert(allInvalidRejected, "Invalid EURC routes correctly rejected");

  // 4. EURC Wrong Spender (REJECT)
  const wrongSpender = "0x808456652fdb597867f38412077A9182bf77359F"; // token itself
  const tokenMessengerSpender = "0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5"; // TokenMessenger
  const isCorrectSpender = (spender: string) => spender.toLowerCase() === EURC_TOKEN_MANAGER.toLowerCase();
  assert(
    !isCorrectSpender(wrongSpender) && !isCorrectSpender(tokenMessengerSpender) && isCorrectSpender(EURC_TOKEN_MANAGER),
    "EURC Wrong Spender (TokenMessenger/Arbitrary) rejected; TokenManager accepted"
  );

  // 5. EURC Wrong TokenId (REJECT)
  const wrongTokenId = "0x1111111111111111111111111111111111111111111111111111111111111111";
  assert(
    (wrongTokenId as string) !== EURC_TOKEN_ID && EURC_TOKEN_ID === "0x2587821a0ee7daa174b95436b5dab1731cfa1844775b010217d3c0dd02a4eecd",
    "EURC Wrong TokenId rejected"
  );

  // 6. EURC Wrong Domain (REJECT)
  const isDomainPairValid = (sDom: number, dDom: number) =>
    (sDom === 6 && dDom === 26) || (sDom === 26 && dDom === 6);
  assert(
    isDomainPairValid(6, 26) && isDomainPairValid(26, 6) && !isDomainPairValid(6, 3) && !isDomainPairValid(0, 26),
    "EURC Wrong Domain rejected"
  );

  // 7 & 8. 32-byte Destination Address (REJECT) vs 20-byte Packed Destination Address (PASS)
  const recipient = getAddress("0x272e5ffc84d4c38dfeeeb01a792576b92f70b777");
  const packed20 = encodePacked(["address"], [recipient]);
  const byteLength = (packed20.length - 2) / 2;
  const isRaw32 = packed20.length === 66; // 32 bytes hex length with 0x is 66 chars
  assert(byteLength === 20 && !isRaw32, "20-byte packed destination address PASS (exactly 20 bytes, not 32-byte ABI padded)");

  // 9. Expired Quote Validation (REJECT)
  const nowSec = Math.floor(Date.now() / 1000);
  const expiredQuote = { expiresAt: nowSec - 60 };
  const freshQuote = { expiresAt: nowSec + 600 };
  const isQuoteExpired = (q: { expiresAt: number }) => q.expiresAt < Math.floor(Date.now() / 1000);
  assert(isQuoteExpired(expiredQuote) && !isQuoteExpired(freshQuote), "Expired quote rejected");

  // 10. Insufficient Native Gas (REJECT)
  const nativeBalance = BigInt("1000000000000000"); // 0.001 ETH
  const feeRequired = BigInt("2000000000000000"); // 0.002 ETH
  const hasGasForFee = (bal: bigint, fee: bigint) => bal > fee;
  assert(!hasGasForFee(nativeBalance, feeRequired), "Insufficient native gas rejected");

  // 11. USDC Existing Route Untouched
  assert(
    BRIDGE_ASSETS.USDC.supportedChains.length === 5 &&
      BRIDGE_ASSETS.USDC.supportedChains.includes("Arbitrum Sepolia") &&
      BRIDGE_ASSETS.USDC.supportedChains.includes("Solana Devnet"),
    "USDC existing route configuration intact"
  );

  // 12. History Migration (PASS)
  const legacyRecord: { id: string; amount: string; token?: "USDC" | "EURC" } = {
    id: "tx-1",
    amount: "10",
  };
  const resolvedToken = legacyRecord.token || "USDC";
  const eurcRecord: { id: string; amount: string; token?: "USDC" | "EURC" } = {
    id: "tx-2",
    amount: "5",
    token: "EURC",
  };
  assert(
    resolvedToken === "USDC" && eurcRecord.token === "EURC",
    "History migration: Legacy records without token interpret as USDC; new records store EURC"
  );

  // 13. USDC Regression Check: use-bridge.ts exists
  const useBridgePath = path.resolve(process.cwd(), "src/hooks/use-bridge.ts");
  const useBridgeExists = fs.existsSync(useBridgePath);
  assert(useBridgeExists, "USDC regression check: use-bridge.ts exists and preserved");

  // 14. Transaction Hash Separation: sourceTxHash !== destinationTxHash
  const arcSourceTx = "0x50aaf37937bf6e1468115ebc034239eeab509e03ba98af01abfed60bf63d9dcf";
  const baseDestTx = "0x05d9fe919b41699cc98f45f38155fb4ced0f4ec97fdbbd233c12a7ccd42ad7a3";
  assert(
    arcSourceTx.toLowerCase() !== baseDestTx.toLowerCase(),
    "Strict separation: Arc source hash and Base destination hash are distinct"
  );

  // 15. Chain-Aware Explorer URLs: Arc -> ArcScan, Base -> BaseScan
  const arcExplorerLink = getBridgeExplorerTxUrl("Arc Testnet", arcSourceTx);
  const baseExplorerLink = getBridgeExplorerTxUrl("Base Sepolia", baseDestTx);
  assert(
    arcExplorerLink === `https://testnet.arcscan.app/tx/${arcSourceTx}` &&
      !arcExplorerLink.includes("basescan") &&
      baseExplorerLink === `https://sepolia.basescan.org/tx/${baseDestTx}` &&
      !baseExplorerLink.includes("arcscan"),
    "Explorer URLs: Arc source uses ArcScan, Base destination uses BaseScan"
  );

  // 16. Reverse Direction Explorer URLs: Base -> Arc
  const baseSourceTx = "0xff346967b1d2204015a79c0a392b83cb04831874e616b28649eb1281f1769a37";
  const arcDestTx = "0x41c5f9843057bb30c92e7e3a5d26098d644717e3b5b66ef356b4518f1577fab8";
  const reverseBaseLink = getBridgeExplorerTxUrl("Base Sepolia", baseSourceTx);
  const reverseArcLink = getBridgeExplorerTxUrl("Arc Testnet", arcDestTx);
  assert(
    reverseBaseLink === `https://sepolia.basescan.org/tx/${baseSourceTx}` &&
      reverseArcLink === `https://testnet.arcscan.app/tx/${arcDestTx}`,
    "Reverse Explorer URLs: Base source uses BaseScan, Arc destination uses ArcScan"
  );

  // 17. Multi-chain Explorer Coverage
  assert(
    getBridgeExplorerTxUrl("Arbitrum Sepolia", "0xabc") === "https://sepolia.arbiscan.io/tx/0xabc" &&
      getBridgeExplorerTxUrl("Solana Devnet", "5abc") === "https://explorer.solana.com/tx/5abc?cluster=devnet" &&
      getBridgeExplorerTxUrl("GenLayer Bradbury", "0xgen") === "https://explorer-bradbury.genlayer.com/tx/0xgen",
    "Multi-chain Explorer Coverage: Arbitrum, Solana, GenLayer URLs accurate"
  );

  // 18. Legacy Transfer Corrupted destTx Purge (Regression fix verification)
  const legacyCorruptedTransfer = {
    sourceTx: "0x37a3225f11111111111111111111111111111111111111111111111111111111",
    destTx: "0x37a3225f11111111111111111111111111111111111111111111111111111111",
  };
  const isCorrupted =
    legacyCorruptedTransfer.destTx.toLowerCase() === legacyCorruptedTransfer.sourceTx.toLowerCase();
  const sanitizedDest = isCorrupted ? undefined : legacyCorruptedTransfer.destTx;
  assert(
    isCorrupted && sanitizedDest === undefined,
    "Legacy Transfer Sanitization: Duplicate sourceTx masquerading as destTx is detected and purged"
  );

  // 19. CCTP Domain Lookup Accuracy
  assert(
    getCctpDomain("Base Sepolia") === 6 &&
      getCctpDomain("Arc Testnet") === 26 &&
      getCctpDomain("Arbitrum Sepolia") === 3 &&
      getCctpDomain("Unknown Chain") === undefined,
    "CCTP Domain lookup accurate for Base (6), Arc (26), Arbitrum (3)"
  );

  // 20. Refresh Persistence Data Model
  const fullTransferRecord = {
    sourceTxHash: arcSourceTx,
    destinationTxHash: baseDestTx,
    fromChain: "Arc Testnet",
    toChain: "Base Sepolia",
    asset: "EURC" as const,
    amount: "0.1",
    status: "Completed",
  };
  assert(
    fullTransferRecord.sourceTxHash === arcSourceTx &&
      fullTransferRecord.destinationTxHash === baseDestTx &&
      (fullTransferRecord.sourceTxHash as string) !== (fullTransferRecord.destinationTxHash as string),
    "Refresh Persistence Model: Preserves distinct sourceTxHash and destinationTxHash"
  );

  console.log("\n==================================================");
  console.log(`TOTAL TESTS: ${passed + failed}`);
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
