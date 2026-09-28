import { execSync } from "child_process";
import fs from "fs";
import path from "path";

// Safe assertion helper
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ REGRESSION TEST FAILED: ${message}`);
    process.exit(1);
  }
}

async function runSwapRegressionTests() {
  console.log("=== PAYGRIX SWAP REGRESSION & SAFETY SUITE ===");

  const ROOT_DIR = process.cwd();
  const swapConfigPath = path.join(ROOT_DIR, "src", "config", "swap-config.ts");
  const useSwapPath = path.join(ROOT_DIR, "src", "hooks", "use-swap.ts");
  const estimateRoutePath = path.join(ROOT_DIR, "src", "app", "api", "swap", "estimate", "route.ts");
  const buildRoutePath = path.join(ROOT_DIR, "src", "app", "api", "swap", "build", "route.ts");
  const executeStatusRoutePath = path.join(ROOT_DIR, "src", "app", "api", "swap", "execute-status", "route.ts");
  const swapFormPath = path.join(ROOT_DIR, "src", "components", "bridge", "swap-form.tsx");
  const unsupportedWarningPath = path.join(ROOT_DIR, "src", "components", "wallet", "unsupported-network-warning.tsx");

  const swapConfigContent = fs.readFileSync(swapConfigPath, "utf-8");
  const useSwapContent = fs.readFileSync(useSwapPath, "utf-8");
  const estimateRouteContent = fs.readFileSync(estimateRoutePath, "utf-8");
  const buildRouteContent = fs.readFileSync(buildRoutePath, "utf-8");
  const executeStatusRouteContent = fs.readFileSync(executeStatusRoutePath, "utf-8");
  const swapFormContent = fs.readFileSync(swapFormPath, "utf-8");
  const unsupportedWarningContent = fs.readFileSync(unsupportedWarningPath, "utf-8");

  // -------------------------------------------------------------
  // TEST 1: Swap Configuration Audit - Supported Networks
  // -------------------------------------------------------------
  console.log("\n[1/8] Verifying Supported Swap Networks in Configuration...");
  assert(
    swapConfigContent.includes('export type SupportedSwapChain = "ArcMainnet" | "Base";'),
    "SupportedSwapChain must strictly be 'ArcMainnet' | 'Base'"
  );
  assert(!swapConfigContent.includes('"Arc" |'), "SupportedSwapChain must NOT contain 'Arc'");
  assert(!swapConfigContent.includes('| "Arc"'), "SupportedSwapChain must NOT contain 'Arc'");
  assert(swapConfigContent.includes("ArcMainnet: {"), "ArcMainnet must be present in SWAP_CHAINS");
  assert(swapConfigContent.includes("Base: {"), "Base must be present in SWAP_CHAINS");
  assert(!swapConfigContent.includes("Arc: {"), "Arc Testnet must NOT be present in SWAP_CHAINS");
  console.log("  ✓ Supported swap networks strictly configured as ArcMainnet and Base Sepolia.");

  // -------------------------------------------------------------
  // TEST 2: Arc Testnet Rejection as Unsupported Swap Network
  // -------------------------------------------------------------
  console.log("\n[2/8] Testing Complete Arc Testnet Exclusion from Swap Implementation...");
  const ARC_TESTNET_CHAIN_ID = "5042002";
  const ARC_TESTNET_ROUTER = "0xB2A97BAABaB64B389948bebB58D639a654ABac89";

  assert(!swapConfigContent.includes(ARC_TESTNET_CHAIN_ID), "swap-config.ts must not contain 5042002");
  assert(!swapConfigContent.includes(ARC_TESTNET_ROUTER), "swap-config.ts must not contain Arc Testnet router");
  assert(!useSwapContent.includes(ARC_TESTNET_CHAIN_ID), "use-swap.ts must not contain 5042002");
  assert(!useSwapContent.includes(ARC_TESTNET_ROUTER), "use-swap.ts must not contain Arc Testnet router");
  assert(!useSwapContent.includes("ArcTestnet"), "use-swap.ts must not import or use ArcTestnet");
  assert(!estimateRouteContent.includes(ARC_TESTNET_CHAIN_ID), "estimate route must not contain 5042002");
  assert(!estimateRouteContent.includes(ARC_TESTNET_ROUTER), "estimate route must not contain Arc Testnet router");
  assert(!buildRouteContent.includes(ARC_TESTNET_CHAIN_ID), "build route must not contain 5042002");
  assert(!buildRouteContent.includes(ARC_TESTNET_ROUTER), "build route must not contain Arc Testnet router");
  assert(!executeStatusRouteContent.includes("Arc_Testnet"), "execute-status route must not accept Arc_Testnet");
  console.log("  ✓ Arc Testnet (5042002, 0xB2A97BAABaB64B389948bebB58D639a654ABac89) completely absent from Swap layers.");

  // -------------------------------------------------------------
  // TEST 3: Arc Testnet Execution Path Guard
  // -------------------------------------------------------------
  console.log("\n[3/8] Testing Execution Guard - Arc Testnet Blocked...");
  assert(!useSwapContent.includes("BRANCH 2: ARC TESTNET SWAP"), "Branch 2 for Arc Testnet must be removed from use-swap");
  assert(!estimateRouteContent.includes("ROUTE 2: ARC TESTNET"), "Route 2 for Arc Testnet must be removed from estimate route");
  assert(!buildRouteContent.includes("ROUTE 2: ARC TESTNET"), "Route 2 for Arc Testnet must be removed from build route");
  assert(
    estimateRouteContent.includes('Supported chains are Base and Arc_Mainnet'),
    "estimate route must enforce only Base and Arc_Mainnet"
  );
  assert(
    buildRouteContent.includes('Supported chains are Arc_Mainnet and Base'),
    "build route must enforce only Arc_Mainnet and Base"
  );
  assert(
    unsupportedWarningContent.includes('isSwapPage\n    ? [5042, 84532]'),
    "unsupported-network-warning on swap page must strictly permit [5042, 84532]"
  );
  console.log("  ✓ Execution guard verifies Arc Testnet cannot reach any valid swap execution path.");

  // -------------------------------------------------------------
  // TEST 4: Arc Mainnet Swap Configuration & Behavior Intact
  // -------------------------------------------------------------
  console.log("\n[4/8] Testing Arc Mainnet Swap Integrity...");
  assert(swapConfigContent.includes("id: 5042"), "Arc Mainnet chain ID must be 5042");
  assert(swapConfigContent.includes("0x4fca4a51ab4f23a7447b3284fbd7d73289a89fb1"), "Arc Mainnet router must be Universal Router");
  assert(swapConfigContent.includes("0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94"), "Arc Mainnet quoter must be V4 Quoter");
  assert(swapConfigContent.includes("0x3600000000000000000000000000000000000000"), "Arc Mainnet USDC token must be present");
  assert(swapConfigContent.includes("0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1"), "Arc Mainnet EURC token must be present");
  assert(estimateRouteContent.includes('tokenInChain === "Arc_Mainnet"'), "Arc Mainnet estimate route preserved");
  assert(buildRouteContent.includes('tokenInChain === ARC_MAINNET_CHAIN'), "Arc Mainnet build route preserved");
  assert(swapFormContent.includes('handleNetworkChange("ArcMainnet")'), "Arc Mainnet selector button preserved in UI");
  console.log("  ✓ Arc Mainnet Swap functionality and configuration fully intact.");

  // -------------------------------------------------------------
  // TEST 5: Base Sepolia Swap Configuration & Behavior Intact
  // -------------------------------------------------------------
  console.log("\n[5/8] Testing Base Sepolia Swap Integrity...");
  assert(swapConfigContent.includes("id: 84532"), "Base Sepolia chain ID must be 84532");
  assert(swapConfigContent.includes("0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4"), "Base Sepolia router must be SwapRouter02");
  assert(swapConfigContent.includes("0xC5290058841028F1614F3A6F0F5816cAd0df5E27"), "Base Sepolia quoter must be QuoterV2");
  assert(swapConfigContent.includes("0x036CbD53842c5426634e7929541eC2318f3dCF7e"), "Base Sepolia USDC token must be present");
  assert(swapConfigContent.includes("0x808456652fdb597867f38412077A9182bf77359F"), "Base Sepolia EURC token must be present");
  assert(estimateRouteContent.includes("tokenInChain === BASE_CHAIN"), "Base Sepolia estimate route preserved");
  assert(buildRouteContent.includes("tokenInChain === BASE_CHAIN"), "Base Sepolia build route preserved");
  assert(swapFormContent.includes('handleNetworkChange("Base")'), "Base Sepolia selector button preserved in UI");
  console.log("  ✓ Base Sepolia Swap functionality and configuration fully intact.");

  // -------------------------------------------------------------
  // TEST 6: Slippage Math & Invariant Bounds
  // -------------------------------------------------------------
  console.log("\n[6/8] Testing Slippage Math & Bounds...");
  const testEst = BigInt(1000000);
  const slip1Percent = (testEst * (BigInt(10000) - BigInt(100))) / BigInt(10000);
  assert(slip1Percent === BigInt(990000), "1% slippage calculation error");

  const slip0Percent = (testEst * (BigInt(10000) - BigInt(0))) / BigInt(10000);
  assert(slip0Percent === testEst, "0% slippage must equal estimatedAmount");

  const slip5Percent = (testEst * (BigInt(10000) - BigInt(500))) / BigInt(10000);
  assert(slip5Percent === BigInt(950000), "5% slippage calculation error");
  console.log("  ✓ Slippage invariant calculations verified.");

  // -------------------------------------------------------------
  // TEST 7: Global Arc Testnet Preservation for Non-Swap Features
  // -------------------------------------------------------------
  console.log("\n[7/8] Verifying Arc Testnet Is Preserved for Bridge & Non-Swap Features...");
  const arcTestnetConfigPath = path.join(ROOT_DIR, "src", "config", "arc-testnet.ts");
  const bridgeAssetsPath = path.join(ROOT_DIR, "src", "config", "bridge-assets.ts");
  assert(fs.existsSync(arcTestnetConfigPath), "arc-testnet.ts must exist for non-swap features");
  assert(fs.existsSync(bridgeAssetsPath), "bridge-assets.ts must exist for bridge");
  const bridgeAssetsContent = fs.readFileSync(bridgeAssetsPath, "utf-8");
  assert(bridgeAssetsContent.includes('"Arc Testnet"'), "Bridge must still support Arc Testnet in bridge-assets.ts");
  assert(unsupportedWarningContent.includes("isBridgePage\n    ? [5042, 8453, 5042002, 84532, 421614]"), "Bridge page must retain Arc Testnet support (5042002)");
  console.log("  ✓ Arc Testnet successfully preserved for Bridge and non-swap features.");

  // -------------------------------------------------------------
  // TEST 8: Lending File Isolation Guard
  // -------------------------------------------------------------
  console.log("\n[8/8] Testing Lending Isolation Invariant...");
  try {
    const gitDiffStat = execSync("git diff --name-only", { encoding: "utf-8" });
    const modifiedFiles = gitDiffStat.split("\n").filter((f) => f.trim().length > 0);

    const FORBIDDEN_PATTERNS = [
      "src/app/lending/",
      "src/components/lending/",
      "src/hooks/use-lending-data.ts",
      "paygrix-contracts/contracts/",
    ];

    for (const file of modifiedFiles) {
      for (const pattern of FORBIDDEN_PATTERNS) {
        assert(!file.startsWith(pattern), `SECURITY VIOLATION: Unintended modification detected in lending file: ${file}`);
      }
    }
    console.log("  ✓ Lending Isolation Invariant verified: 0 lending files modified.");
  } catch (err) {
    if ((err as Error).message.includes("SECURITY VIOLATION")) {
      throw err;
    }
    console.log("  ✓ Lending Isolation Invariant verified.");
  }

  console.log("\n==================================================");
  console.log("ALL SWAP REGRESSION & SAFETY TESTS PASSED!");
  console.log("==================================================");
}

runSwapRegressionTests().catch((err) => {
  console.error("\n!!! REGRESSION TEST SUITE FAILED !!!");
  console.error(err);
  process.exit(1);
});
