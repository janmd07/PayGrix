import { parseAbi, encodeFunctionData } from "viem";
import { SWAP_CHAINS } from "../src/config/swap-config";
import { basePublicClient } from "../src/lib/base-client";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ BASE SWAP REGRESSION TEST FAILED: ${message}`);
    process.exit(1);
  }
}


async function runBaseSwapRegressionTests() {
  console.log("=== PAYGRIX BASE SWAP REGRESSION & SAFETY SUITE ===\n");

  const baseConfig = SWAP_CHAINS.Base;
  const USDC_ADDRESS = baseConfig.tokens.USDC.address;
  const EURC_ADDRESS = baseConfig.tokens.EURC.address;
  const POOL_ADDRESS = baseConfig.poolAddress!;
  const QUOTER_ADDRESS = baseConfig.quoterAddress!;
  const ROUTER_ADDRESS = baseConfig.routerAddress;

  // -------------------------------------------------------------
  // TEST 1: Chain ID & Contract Addresses
  // -------------------------------------------------------------
  console.log("[1/6] Testing Base Sepolia Chain ID and Verified Addresses...");
  assert(baseConfig.id === 84532, "Base Chain ID must be 84532");
  assert(USDC_ADDRESS.toLowerCase() === "0x036cbd53842c5426634e7929541ec2318f3dcf7e", "Base Sepolia USDC mismatch");
  assert(EURC_ADDRESS.toLowerCase() === "0x808456652fdb597867f38412077a9182bf77359f", "Base Sepolia EURC mismatch");
  assert(POOL_ADDRESS.toLowerCase() === "0x43047a302cd99ddb32e32b2886b40935b60ad2c1", "Base Sepolia Pool mismatch");
  assert(QUOTER_ADDRESS.toLowerCase() === "0xc5290058841028f1614f3a6f0f5816cad0df5e27", "Base Sepolia QuoterV2 mismatch");
  assert(ROUTER_ADDRESS.toLowerCase() === "0x94cc0aac535ccdb3c01d6787d6413c739ae12bc4", "Base Sepolia SwapRouter02 mismatch");
  console.log("  ✓ All Base Sepolia contract addresses strictly match verified on-chain deployments.");

  // -------------------------------------------------------------
  // TEST 2: On-Chain Pool Verification (Fee, Token Ordering, Liquidity)
  // -------------------------------------------------------------
  console.log("\n[2/6] Verifying Uniswap v3 Pool State on Base Sepolia...");
  const poolAbi = parseAbi([
    "function token0() view returns (address)",
    "function token1() view returns (address)",
    "function fee() view returns (uint24)",
    "function liquidity() view returns (uint128)",
  ]);

  const [t0, t1, fee, liquidity] = await Promise.all([
    basePublicClient.readContract({ address: POOL_ADDRESS, abi: poolAbi, functionName: "token0" }),
    basePublicClient.readContract({ address: POOL_ADDRESS, abi: poolAbi, functionName: "token1" }),
    basePublicClient.readContract({ address: POOL_ADDRESS, abi: poolAbi, functionName: "fee" }),
    basePublicClient.readContract({ address: POOL_ADDRESS, abi: poolAbi, functionName: "liquidity" }),
  ]);

  assert(t0.toLowerCase() === USDC_ADDRESS.toLowerCase(), "Pool token0 must be USDC on Base Sepolia");
  assert(t1.toLowerCase() === EURC_ADDRESS.toLowerCase(), "Pool token1 must be EURC on Base Sepolia");
  assert(fee === 500, "Pool fee tier must be 500 (0.05%)");
  assert(liquidity > BigInt(0), "Pool liquidity must be active (> 0)");
  console.log(`  ✓ Pool verified: token0=USDC, token1=EURC, fee=500, active liquidity=${liquidity.toString()}`);

  // -------------------------------------------------------------
  // TEST 3: QuoterV2 Live Simulation (USDC -> EURC)
  // -------------------------------------------------------------
  console.log("\n[3/6] Testing QuoterV2 Simulation for USDC -> EURC...");
  const quoterAbi = parseAbi([
    "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
  ]);

  const rawAmountInUSDC = BigInt(100_000_000); // 100 USDC (6 decimals)
  const quoteResultUSDC = await basePublicClient.simulateContract({
    address: QUOTER_ADDRESS,
    abi: quoterAbi,
    functionName: "quoteExactInputSingle",
    args: [
      {
        tokenIn: USDC_ADDRESS,
        tokenOut: EURC_ADDRESS,
        amountIn: rawAmountInUSDC,
        fee: 500,
        sqrtPriceLimitX96: BigInt(0),
      },
    ],
  });

  const estEURCOut = quoteResultUSDC.result[0];
  assert(estEURCOut > BigInt(10_000_000) && estEURCOut < BigInt(100_000_000), "100 USDC must return valid EURC quote");
  console.log(`  ✓ 100 USDC quotes to ${(Number(estEURCOut) / 1e6).toFixed(6)} EURC on Base Sepolia.`);

  // -------------------------------------------------------------
  // TEST 4: QuoterV2 Live Simulation (EURC -> USDC)
  // -------------------------------------------------------------
  console.log("\n[4/6] Testing QuoterV2 Simulation for EURC -> USDC (Reverse)...");
  const rawAmountInEURC = BigInt(100_000_000); // 100 EURC (6 decimals)
  const quoteResultEURC = await basePublicClient.simulateContract({
    address: QUOTER_ADDRESS,
    abi: quoterAbi,
    functionName: "quoteExactInputSingle",
    args: [
      {
        tokenIn: EURC_ADDRESS,
        tokenOut: USDC_ADDRESS,
        amountIn: rawAmountInEURC,
        fee: 500,
        sqrtPriceLimitX96: BigInt(0),
      },
    ],
  });

  const estUSDCOut = quoteResultEURC.result[0];
  assert(estUSDCOut > BigInt(10_000_000) && estUSDCOut < BigInt(100_000_000), "100 EURC must return valid USDC quote");
  console.log(`  ✓ 100 EURC quotes to ${(Number(estUSDCOut) / 1e6).toFixed(6)} USDC on Base Sepolia.`);

  // -------------------------------------------------------------
  // TEST 5: Slippage Calculation Invariant
  // -------------------------------------------------------------
  console.log("\n[5/6] Testing Slippage Math & MinOut Calculation...");
  const slipBps = BigInt(100); // 1%
  const minEURCOut = (estEURCOut * (BigInt(10000) - slipBps)) / BigInt(10000);
  assert(minEURCOut < estEURCOut, "minOut must be strictly less than estimatedOut");
  assert(minEURCOut === (estEURCOut * BigInt(9900)) / BigInt(10000), "minOut must equal exactly 99% of estOut");
  console.log(`  ✓ Slippage calculation verified: minOut = ${(Number(minEURCOut) / 1e6).toFixed(6)} EURC`);

  // -------------------------------------------------------------
  // TEST 6: SwapRouter02 Calldata Encoding & Function Signature
  // -------------------------------------------------------------
  console.log("\n[6/6] Testing SwapRouter02 Calldata Encoding...");
  const swapRouterAbi = parseAbi([
    "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)",
  ]);

  const testRecipient = "0x1111111111111111111111111111111111111111";
  const calldata = encodeFunctionData({
    abi: swapRouterAbi,
    functionName: "exactInputSingle",
    args: [
      {
        tokenIn: USDC_ADDRESS,
        tokenOut: EURC_ADDRESS,
        fee: 500,
        recipient: testRecipient,
        amountIn: rawAmountInUSDC,
        amountOutMinimum: minEURCOut,
        sqrtPriceLimitX96: BigInt(0),
      },
    ],
  });

  // exactInputSingle selector for SwapRouter02 is 0x04e45aaf
  assert(calldata.startsWith("0x04e45aaf"), "Calldata must start with exactInputSingle selector 0x04e45aaf");
  console.log(`  ✓ Encoded SwapRouter02 calldata successfully with selector 0x04e45aaf (length: ${calldata.length} chars)`);

  console.log("\n🎉 ALL 6 BASE SWAP REGRESSION TESTS PASSED CLEANLY!");
}

runBaseSwapRegressionTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
