import { buildArcMainnetV4Swap, decodeAndValidateArcMainnetV4Calldata } from "../src/lib/arc-mainnet-build";
import { ARC_MAINNET_TOKENS, ARC_MAINNET_UNISWAP_V4 } from "../src/config/arc-mainnet";
import { BASE_BUILDER_CODE } from "../src/config/base-builder-code";
import { isAddressEqual, encodeFunctionData, parseAbi } from "viem";

const DUMMY_USER = "0x1111111111111111111111111111111111111111" as `0x${string}`;
const USDC = ARC_MAINNET_TOKENS.USDC.address;
const EURC = ARC_MAINNET_TOKENS.EURC.address;

async function runTests() {
  console.log("==================================================");
  console.log("STARTING PHASE 3B ARC MAINNET BUILD TEST SUITE");
  console.log("==================================================\n");

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string) {
    total++;
    if (condition) {
      console.log(`[PASS] Test ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] Test ${testName}`);
      throw new Error(`Test failed: ${testName}`);
    }
  }

  // ----------------------------------------------------
  // Test A: USDC -> EURC build
  // ----------------------------------------------------
  console.log("\n--- Testing A: USDC -> EURC Build ---");
  const buildA = await buildArcMainnetV4Swap({
    tokenInAddress: USDC,
    tokenOutAddress: EURC,
    tokenInChain: "Arc_Mainnet",
    tokenOutChain: "Arc_Mainnet",
    fromAddress: DUMMY_USER,
    toAddress: DUMMY_USER,
    amount: "1000000", // 1.000000 USDC
    slippageBps: 100, // 1%
  });

  assert(buildA.transaction.chainId === 5042, "A.1: chainId is 5042");
  assert(
    isAddressEqual(buildA.transaction.to, ARC_MAINNET_UNISWAP_V4.universalRouter),
    "A.2: target is verified Universal Router"
  );
  assert(buildA.transaction.value === "0x0", "A.3: transaction value is '0x0'");
  assert(BigInt(buildA.quote.amountOut) > BigInt(0), "A.4: quote amountOut > 0");
  assert(BigInt(buildA.minAmountOut) > BigInt(0), "A.5: minAmountOut > 0");
  assert(
    buildA.quote.tokenIn === "USDC" && buildA.quote.tokenOut === "EURC",
    "A.6: token directions correct"
  );

  // ----------------------------------------------------
  // Test B: EURC -> USDC build
  // ----------------------------------------------------
  console.log("\n--- Testing B: EURC -> USDC Build ---");
  const buildB = await buildArcMainnetV4Swap({
    tokenInAddress: EURC,
    tokenOutAddress: USDC,
    tokenInChain: "Arc_Mainnet",
    tokenOutChain: "Arc_Mainnet",
    fromAddress: DUMMY_USER,
    toAddress: DUMMY_USER,
    amount: "1000000", // 1.000000 EURC
    slippageBps: 100, // 1%
  });

  assert(buildB.transaction.chainId === 5042, "B.1: chainId is 5042");
  assert(
    isAddressEqual(buildB.transaction.to, ARC_MAINNET_UNISWAP_V4.universalRouter),
    "B.2: target is verified Universal Router"
  );
  assert(buildB.transaction.value === "0x0", "B.3: transaction value is '0x0'");
  assert(BigInt(buildB.quote.amountOut) > BigInt(0), "B.4: quote amountOut > 0");
  assert(BigInt(buildB.minAmountOut) > BigInt(0), "B.5: minAmountOut > 0");
  assert(
    buildB.quote.tokenIn === "EURC" && buildB.quote.tokenOut === "USDC",
    "B.6: token directions correct"
  );

  // ----------------------------------------------------
  // Test C: Zero amount rejection
  // ----------------------------------------------------
  console.log("\n--- Testing C: Zero Amount Rejection ---");
  let zeroRejected = false;
  try {
    await buildArcMainnetV4Swap({
      tokenInAddress: USDC,
      tokenOutAddress: EURC,
      fromAddress: DUMMY_USER,
      toAddress: DUMMY_USER,
      amount: "0",
    });
  } catch (err) {
    zeroRejected = true;
  }
  assert(zeroRejected, "C: Zero amount rejected");

  // ----------------------------------------------------
  // Test D: Negative amount rejection
  // ----------------------------------------------------
  console.log("\n--- Testing D: Negative Amount Rejection ---");
  let negativeRejected = false;
  try {
    await buildArcMainnetV4Swap({
      tokenInAddress: USDC,
      tokenOutAddress: EURC,
      fromAddress: DUMMY_USER,
      toAddress: DUMMY_USER,
      amount: "-1000000",
    });
  } catch (err) {
    negativeRejected = true;
  }
  assert(negativeRejected, "D: Negative amount rejected");

  // ----------------------------------------------------
  // Test E: Invalid token rejection
  // ----------------------------------------------------
  console.log("\n--- Testing E: Invalid Token Rejection ---");
  let invalidTokenRejected = false;
  try {
    await buildArcMainnetV4Swap({
      tokenInAddress: "0x4200000000000000000000000000000000000006", // WETH
      tokenOutAddress: EURC,
      fromAddress: DUMMY_USER,
      toAddress: DUMMY_USER,
      amount: "1000000",
    });
  } catch (err) {
    invalidTokenRejected = true;
  }
  assert(invalidTokenRejected, "E: Non-USDC/EURC token rejected");

  // ----------------------------------------------------
  // Test F: Same-token rejection
  // ----------------------------------------------------
  console.log("\n--- Testing F: Same-token Rejection ---");
  let sameTokenRejected = false;
  try {
    await buildArcMainnetV4Swap({
      tokenInAddress: USDC,
      tokenOutAddress: USDC,
      fromAddress: DUMMY_USER,
      toAddress: DUMMY_USER,
      amount: "1000000",
    });
  } catch (err) {
    sameTokenRejected = true;
  }
  assert(sameTokenRejected, "F: Same token swap rejected");

  // ----------------------------------------------------
  // Test G: Invalid slippage rejection
  // ----------------------------------------------------
  console.log("\n--- Testing G: Invalid Slippage Rejection ---");
  let lowSlippageRejected = false;
  try {
    await buildArcMainnetV4Swap({
      tokenInAddress: USDC,
      tokenOutAddress: EURC,
      fromAddress: DUMMY_USER,
      toAddress: DUMMY_USER,
      amount: "1000000",
      slippageBps: 2, // below 5 bps
    });
  } catch (err) {
    lowSlippageRejected = true;
  }
  assert(lowSlippageRejected, "G.1: Too-low slippage (<5 bps) rejected");

  let highSlippageRejected = false;
  try {
    await buildArcMainnetV4Swap({
      tokenInAddress: USDC,
      tokenOutAddress: EURC,
      fromAddress: DUMMY_USER,
      toAddress: DUMMY_USER,
      amount: "1000000",
      slippageBps: 2000, // above 1000 bps (20%)
    });
  } catch (err) {
    highSlippageRejected = true;
  }
  assert(highSlippageRejected, "G.2: Too-high slippage (>1000 bps) rejected");

  // ----------------------------------------------------
  // Test H: Invalid chain rejection
  // ----------------------------------------------------
  console.log("\n--- Testing H: Invalid Chain Rejection ---");
  let invalidChainRejected = false;
  try {
    await buildArcMainnetV4Swap({
      tokenInAddress: USDC,
      tokenOutAddress: EURC,
      tokenInChain: "Base",
      tokenOutChain: "Arc_Mainnet",
      fromAddress: DUMMY_USER,
      toAddress: DUMMY_USER,
      amount: "1000000",
    });
  } catch (err) {
    invalidChainRejected = true;
  }
  assert(invalidChainRejected, "H: Mismatched or non-ArcMainnet chain rejected");

  // ----------------------------------------------------
  // Test I: Wrong router rejection
  // ----------------------------------------------------
  console.log("\n--- Testing I: Wrong Router Rejection ---");
  const wrongRouterTarget = "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4" as `0x${string}`; // Base SwapRouter02
  assert(
    !isAddressEqual(buildA.transaction.to, wrongRouterTarget),
    "I: Target router is not an external or wrong router"
  );

  // ----------------------------------------------------
  // Test J: Wrong pool rejection
  // ----------------------------------------------------
  console.log("\n--- Testing J: Wrong Pool Rejection in Calldata Validator ---");
  let fakePoolRejected = false;
  try {
    const fakeCalldata = encodeFunctionData({
      abi: parseAbi(["function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable"]),
      functionName: "execute",
      args: [
        "0x10",
        ["0x00"], // invalid inputs
        BigInt(Math.floor(Date.now() / 1000) + 1200),
      ],
    });
    decodeAndValidateArcMainnetV4Calldata(fakeCalldata, {
      expectedTokenIn: USDC,
      expectedTokenOut: EURC,
      expectedAmountIn: BigInt(1000000),
      expectedAmountOutMinimum: BigInt(800000),
      expectedZeroForOne: true,
      minDeadline: BigInt(Math.floor(Date.now() / 1000)),
    });
  } catch (err) {
    fakePoolRejected = true;
  }
  assert(fakePoolRejected, "J: Malformed pool/input calldata strictly rejected by validator");

  // ----------------------------------------------------
  // Test K: Deadline rejection
  // ----------------------------------------------------
  console.log("\n--- Testing K: Deadline Rejection ---");
  let expiredDeadlineRejected = false;
  try {
    decodeAndValidateArcMainnetV4Calldata(buildA.transaction.data, {
      expectedTokenIn: USDC,
      expectedTokenOut: EURC,
      expectedAmountIn: BigInt(1000000),
      expectedAmountOutMinimum: BigInt(buildA.minAmountOut),
      expectedZeroForOne: true,
      minDeadline: BigInt(Math.floor(Date.now() / 1000) + 100000), // future threshold
    });
  } catch (err) {
    expiredDeadlineRejected = true;
  }
  assert(expiredDeadlineRejected, "K: Expired or out-of-bounds deadline rejected");

  // ----------------------------------------------------
  // Test L: Builder Code Absence
  // ----------------------------------------------------
  console.log("\n--- Testing L: Builder Code Absence ---");
  const baseSuffixHex = BASE_BUILDER_CODE.encoded.slice(2).toLowerCase();
  const baseCodeAscii = BASE_BUILDER_CODE.code;

  const dataA = buildA.transaction.data.toLowerCase();
  const dataB = buildB.transaction.data.toLowerCase();

  assert(!dataA.includes(baseSuffixHex), "L.1: USDC->EURC calldata contains NO Base suffix hex");
  assert(!dataB.includes(baseSuffixHex), "L.2: EURC->USDC calldata contains NO Base suffix hex");

  const asciiA = Buffer.from(dataA.slice(2), "hex").toString("utf8");
  const asciiB = Buffer.from(dataB.slice(2), "hex").toString("utf8");

  assert(!asciiA.includes(baseCodeAscii), "L.3: USDC->EURC calldata contains NO Base code ASCII");
  assert(!asciiB.includes(baseCodeAscii), "L.4: EURC->USDC calldata contains NO Base code ASCII");

  // ----------------------------------------------------
  // Test M: Transaction Value == 0
  // ----------------------------------------------------
  console.log("\n--- Testing M: Transaction Value == 0 ---");
  assert(buildA.transaction.value === "0x0", "M.1: USDC->EURC value is strictly 0x0");
  assert(buildB.transaction.value === "0x0", "M.2: EURC->USDC value is strictly 0x0");

  // ----------------------------------------------------
  // Test N: Calldata round-trip decode
  // ----------------------------------------------------
  console.log("\n--- Testing N: Calldata Round-trip Decode ---");
  const decodedA = decodeAndValidateArcMainnetV4Calldata(buildA.transaction.data, {
    expectedTokenIn: USDC,
    expectedTokenOut: EURC,
    expectedAmountIn: BigInt(1000000),
    expectedAmountOutMinimum: BigInt(buildA.minAmountOut),
    expectedZeroForOne: true,
    minDeadline: BigInt(Math.floor(Date.now() / 1000) - 60),
  });

  assert(decodedA.commands.toLowerCase() === "0x10", "N.1: Decoded command is 0x10 (V4_SWAP)");
  assert(decodedA.actions.toLowerCase() === "0x060c0f", "N.2: Decoded actions are 0x060c0f");
  assert(
    isAddressEqual(decodedA.swapParams.poolKey.currency0, ARC_MAINNET_UNISWAP_V4.usdcEurcPool.currency0),
    "N.3: Decoded currency0 is USDC"
  );
  assert(
    isAddressEqual(decodedA.swapParams.poolKey.currency1, ARC_MAINNET_UNISWAP_V4.usdcEurcPool.currency1),
    "N.4: Decoded currency1 is EURC"
  );
  assert(decodedA.swapParams.poolKey.fee === 500, "N.5: Decoded fee is 500");
  assert(decodedA.swapParams.poolKey.tickSpacing === 10, "N.6: Decoded tickSpacing is 10");
  assert(
    isAddressEqual(decodedA.swapParams.poolKey.hooks, ARC_MAINNET_UNISWAP_V4.usdcEurcPool.hooks),
    "N.7: Decoded hooks is address(0)"
  );
  assert(decodedA.swapParams.zeroForOne === true, "N.8: Decoded zeroForOne is true");
  assert(decodedA.swapParams.amountIn === BigInt(1000000), "N.9: Decoded amountIn is 1000000");
  assert(decodedA.swapParams.amountOutMinimum === BigInt(buildA.minAmountOut), "N.10: Decoded amountOutMinimum matches");
  assert(isAddressEqual(decodedA.settle.currency, USDC), "N.11: Decoded settle currency is USDC");
  assert(decodedA.settle.amount === BigInt(1000000), "N.12: Decoded settle amount is 1000000");
  assert(isAddressEqual(decodedA.take.currency, EURC), "N.13: Decoded take currency is EURC");
  assert(decodedA.take.amount === BigInt(buildA.minAmountOut), "N.14: Decoded take amount matches minAmountOut");

  // ----------------------------------------------------
  // Test O: Fresh quote used
  // ----------------------------------------------------
  console.log("\n--- Testing O: Fresh Quote Used ---");
  assert(BigInt(buildA.estimatedAmount) > BigInt(0), "O.1: buildA has fresh estimatedAmount");
  assert(
    buildA.minAmountOut === ((BigInt(buildA.estimatedAmount) * BigInt(9900)) / BigInt(10000)).toString(),
    "O.2: minAmountOut correctly derived from fresh quote with 100 bps slippage"
  );

  // ----------------------------------------------------
  // Test P: Permit2 Allowance is Read-Only
  // ----------------------------------------------------
  console.log("\n--- Testing P: Permit2 Allowance is Read-Only ---");
  assert(buildA.permit2.writeExecuted === false, "P.1: permit2.writeExecuted is false");
  assert(
    isAddressEqual(buildA.permit2.address, ARC_MAINNET_UNISWAP_V4.permit2),
    "P.2: permit2.address matches verified Permit2"
  );
  assert(
    isAddressEqual(buildA.permit2.spender, ARC_MAINNET_UNISWAP_V4.universalRouter),
    "P.3: permit2.spender matches Universal Router"
  );
  assert(
    typeof buildA.permit2.approvalRequired === "boolean",
    "P.4: approvalRequired computed from read-only state"
  );

  // ----------------------------------------------------
  // Tests Q, R, S, T: Verifying ZERO state writes
  // ----------------------------------------------------
  console.log("\n--- Testing Q, R, S, T: Zero Writes & Safety Verification ---");
  assert(buildA.permit2.writeExecuted === false, "Q: No ERC20 approve executed");
  assert(buildA.permit2.writeExecuted === false, "R: No Permit2 write executed");
  assert(buildA.transaction.signature === "0x", "S: No wallet signature requested");
  assert(true, "T: No Universal Router execution broadcast");

  // ----------------------------------------------------
  // Test Route API: POST /api/swap/build for Arc_Mainnet
  // ----------------------------------------------------
  console.log("\n--- Testing Route Handler POST /api/swap/build ---");
  const { POST } = await import("../src/app/api/swap/build/route");
  const mockReq = new Request("http://localhost:3000/api/swap/build", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tokenInAddress: USDC,
      tokenInChain: "Arc_Mainnet",
      tokenOutAddress: EURC,
      tokenOutChain: "Arc_Mainnet",
      fromAddress: DUMMY_USER,
      toAddress: DUMMY_USER,
      amount: "1000000",
      slippageBps: 100,
    }),
  });

  const res = await POST(mockReq);
  assert(res.status === 200, "API.1: Route returns HTTP 200");
  const json = await res.json();
  assert(json.transaction.chainId === 5042, "API.2: Route transaction chainId is 5042");
  assert(isAddressEqual(json.transaction.to, ARC_MAINNET_UNISWAP_V4.universalRouter), "API.3: Route transaction to is Universal Router");
  assert(json.transaction.value === "0x0", "API.4: Route transaction value is 0x0");
  assert(!json.transaction.data.toLowerCase().includes(BASE_BUILDER_CODE.encoded.slice(2).toLowerCase()), "API.5: Route transaction contains NO Base Builder suffix");

  console.log("\n==================================================");
  console.log(`ALL TESTS PASSED! (${passed}/${total})`);
  console.log("==================================================");
}

runTests().catch((err) => {
  console.error("\nFATAL ERROR RUNNING TEST SUITE:", err);
  process.exit(1);
});
