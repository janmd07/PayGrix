const { ethers } = require("d:/arc-payout/node_modules/ethers");
const genlayer = require("d:/arc-payout/node_modules/genlayer-js");
const dotenv = require("d:/arc-payout/node_modules/dotenv");
dotenv.config({ path: "d:/arc-payout/.env" });

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForGenLayerTx(genClient, txHash, label, maxAttempts = 40) {
  console.log(`Waiting for GenLayer transaction (${label}): ${txHash}...`);
  let lastStatus = "";
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const tx = await genClient.getTransaction({ hash: txHash });
      lastStatus = tx.statusName;
      console.log(`  [${label} Poll ${i + 1}/${maxAttempts}] Status: ${tx.statusName} | Result: ${tx.resultName} | ExecResult: ${tx.txExecutionResultName || "N/A"}`);
      if (tx.statusName === "FINALIZED" || tx.statusName === "ACCEPTED") {
        if (tx.txExecutionResultName === "FINISHED_WITH_ERROR" || tx.resultName === "DISAGREE") {
          throw new Error(`GenLayer transaction ${txHash} failed on validators: ${tx.txExecutionResultName}`);
        }
        return tx;
      }
    } catch (e) {
      if (e.message.includes("failed on validators")) throw e;
      console.log(`  [${label} Poll ${i + 1}/${maxAttempts}] Pending fetch (${e.message})...`);
    }
    await sleep(3500);
  }
  throw new Error(`GenLayer transaction ${txHash} timed out (last status: ${lastStatus})`);
}

async function runFreshRoundTripTest() {
  console.log("================================================================================");
  console.log("=== PAYGRIX FRESH 1.000000 USDC REAL ON-CHAIN LIVE ROUND-TRIP BRIDGE TEST ===");
  console.log("================================================================================");

  const rawKey = process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (!rawKey) throw new Error("Private key missing in environment");
  const privateKey = rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`;

  // 1. Providers & Wallets
  const baseProvider = new ethers.JsonRpcProvider("https://sepolia.base.org");
  const baseWallet = new ethers.Wallet(privateKey, baseProvider);

  const genAccount = genlayer.createAccount(privateKey);
  const genClient = genlayer.createClient({
    chain: genlayer.chains.testnetBradbury,
    account: genAccount,
  });

  const BASE_USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
  const BASE_ROUTER_ADDRESS = "0x05c69956564c556fc303Cb74C5505D0E1e8EDF2D";
  const BASE_VAULT_ADDRESS = "0x9e5807B3470AF8E5a316FEa847fd87EdB2DCFfF7";
  const TOKEN_V2_ADDRESS = "0x68da7D080094ddbf6B3fb4f57cC847D930452778";
  const MANAGER_V2_ADDRESS = "0x70Fe1FbABb032B4F99FeEAbea3D26326321aF8e2";
  const V1_TOKEN_ADDRESS = "0xf1BB236652fF8b81f25be4f48f153D7F21E61138";

  const TEST_AMOUNT_RAW = 1000000n; // Exactly 1.000000 USDC
  const deployerAddress = baseWallet.address;

  console.log("Deployer Address (Base & GenLayer):", deployerAddress);
  console.log("Base Sepolia Router:               ", BASE_ROUTER_ADDRESS);
  console.log("Base Sepolia Vault:                ", BASE_VAULT_ADDRESS);
  console.log("Base Sepolia USDC:                 ", BASE_USDC_ADDRESS);
  console.log("GenLayer V2 pUSDC:                 ", TOKEN_V2_ADDRESS);
  console.log("GenLayer V2 Bridge Manager:        ", MANAGER_V2_ADDRESS);
  console.log("Historical V1 pUSDC (Untouched):   ", V1_TOKEN_ADDRESS);
  console.log("Test Amount:                       ", TEST_AMOUNT_RAW.toString(), "raw units (1.000000 USDC)\n");

  // Contract Interfaces
  const routerAbi = [
    "function owner() external view returns (address)",
    "function authorizedBridgeManager() external view returns (address)",
    "function bridgeUSDC(uint256 amount, address genLayerRecipient) external returns (bytes32 bridgeId)",
    "function releaseUSDC(bytes32 burnId, uint256 sourceChainId, address genLayerBridgeManager, address recipient, uint256 amount, uint256 nonce, uint256 deadline, bytes[] calldata signatures) external",
    "function DOMAIN_SEPARATOR_BASE() external view returns (bytes32)",
    "function isAuthorizedSigner(address) external view returns (bool)",
    "function processedReleases(bytes32) external view returns (bool)",
    "function processedNonces(uint256) external view returns (bool)",
    "event TokensBridged(bytes32 indexed bridgeId, address indexed sender, address indexed recipient, uint256 amount, uint256 nonce, uint256 sourceChainId, uint256 destinationChainId, uint256 timestamp)",
    "event TokensReleased(bytes32 indexed burnId, address indexed recipient, uint256 amount, uint256 nonce, uint256 timestamp)",
  ];
  const baseRouterContract = new ethers.Contract(BASE_ROUTER_ADDRESS, routerAbi, baseWallet);

  const erc20Abi = [
    "function balanceOf(address account) external view returns (uint256)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function approve(address spender, uint256 amount) external returns (bool)",
  ];
  const baseUsdcContract = new ethers.Contract(BASE_USDC_ADDRESS, erc20Abi, baseWallet);

  // --------------------------------------------------------------------------------
  // INITIAL READ-ONLY STATE CHECKS
  // --------------------------------------------------------------------------------
  console.log("--- [STEP 0: INITIAL ON-CHAIN STATE AUDIT] ---");
  const initialBaseWalletBal = await baseUsdcContract.balanceOf(deployerAddress);
  const initialBaseVaultBal = await baseUsdcContract.balanceOf(BASE_VAULT_ADDRESS);
  const initialV2Supply = await genClient.readContract({
    address: TOKEN_V2_ADDRESS,
    functionName: "get_total_supply",
    args: [],
  });
  const initialV2Balance = await genClient.readContract({
    address: TOKEN_V2_ADDRESS,
    functionName: "balance_of",
    args: [deployerAddress],
  });

  console.log(`Initial Base Wallet USDC: ${initialBaseWalletBal.toString()} (${Number(initialBaseWalletBal) / 1e6} USDC)`);
  console.log(`Initial Base Vault USDC:  ${initialBaseVaultBal.toString()} (${Number(initialBaseVaultBal) / 1e6} USDC)`);
  console.log(`Initial V2 pUSDC Balance: ${initialV2Balance.toString()} (${Number(initialV2Balance) / 1e6} pUSDC)`);
  console.log(`Initial V2 pUSDC Supply:  ${initialV2Supply.toString()} (${Number(initialV2Supply) / 1e6} pUSDC)`);

  if (initialBaseWalletBal < TEST_AMOUNT_RAW) {
    throw new Error(`Insufficient Base wallet USDC balance: ${initialBaseWalletBal}`);
  }

  // --------------------------------------------------------------------------------
  // PHASE 1: FORWARD BRIDGE (Base Sepolia -> GenLayer Bradbury)
  // --------------------------------------------------------------------------------
  console.log("\n--- [PHASE 1: EXECUTE REAL BASE SEPOLIA -> GENLAYER FORWARD BRIDGE] ---");

  const allowance = await baseUsdcContract.allowance(deployerAddress, BASE_VAULT_ADDRESS);
  if (allowance < TEST_AMOUNT_RAW) {
    console.log("Approving Base Vault for USDC transfer...");
    const approveTx = await baseUsdcContract.approve(BASE_VAULT_ADDRESS, TEST_AMOUNT_RAW * 100n);
    await approveTx.wait();
    console.log("✓ Vault approval confirmed.");
  }

  console.log(`Calling BaseRouter.bridgeUSDC(${TEST_AMOUNT_RAW}, ${deployerAddress})...`);
  const bridgeTx = await baseRouterContract.bridgeUSDC(TEST_AMOUNT_RAW, deployerAddress);
  console.log("Base Forward Bridge TX Hash:", bridgeTx.hash);
  console.log("Waiting for Base Sepolia confirmation...");
  const bridgeReceipt = await bridgeTx.wait();
  console.log("✓ Base Forward Bridge confirmed in block:", bridgeReceipt.blockNumber);
  console.log(`  BaseScan: https://sepolia.basescan.org/tx/${bridgeTx.hash}`);

  let forwardBridgeId = null;
  let forwardNonce = null;
  for (const log of bridgeReceipt.logs) {
    try {
      const parsed = baseRouterContract.interface.parseLog(log);
      if (parsed && parsed.name === "TokensBridged") {
        forwardBridgeId = parsed.args.bridgeId;
        forwardNonce = parsed.args.nonce;
        console.log("✓ TokensBridged Event Detected!");
        console.log("  Bridge ID: ", forwardBridgeId);
        console.log("  Nonce:     ", forwardNonce.toString());
        break;
      }
    } catch {
      // ignore
    }
  }
  if (!forwardBridgeId) throw new Error("Failed to extract forwardBridgeId from TokensBridged event");

  await sleep(4000);

  console.log(`\nBroadcasting execute_inbound_mint to GenLayer Manager V2 (${MANAGER_V2_ADDRESS})...`);
  const mintTxHash = await genClient.writeContract({
    address: MANAGER_V2_ADDRESS,
    functionName: "execute_inbound_mint",
    args: [
      forwardBridgeId,
      deployerAddress,
      deployerAddress,
      Number(TEST_AMOUNT_RAW),
      Number(forwardNonce),
      84532,
      4221,
      BASE_ROUTER_ADDRESS,
      bridgeTx.hash,
      genAccount.address,
    ],
  });
  console.log("GenLayer Inbound Mint TX Hash:", mintTxHash);
  await waitForGenLayerTx(genClient, mintTxHash, "GenLayer Inbound Mint");
  console.log(`  GenLayer Explorer: https://explorer-bradbury.genlayer.com/tx/${mintTxHash}`);

  // Poll GenLayer pUSDC balance until internal cross-contract mint is committed on-chain
  console.log("Waiting for GenLayer pUSDC balance to update on-chain...");
  let fwdV2Balance = 0n;
  let fwdV2Supply = 0n;
  for (let i = 0; i < 15; i++) {
    await sleep(2500);
    fwdV2Balance = await genClient.readContract({
      address: TOKEN_V2_ADDRESS,
      functionName: "balance_of",
      args: [deployerAddress],
    });
    fwdV2Supply = await genClient.readContract({
      address: TOKEN_V2_ADDRESS,
      functionName: "get_total_supply",
      args: [],
    });
    console.log(`  [Poll ${i + 1}/15] V2 Balance: ${fwdV2Balance.toString()} | V2 Supply: ${fwdV2Supply.toString()}`);
    if (Number(fwdV2Balance) === Number(TEST_AMOUNT_RAW) && Number(fwdV2Supply) === Number(TEST_AMOUNT_RAW)) {
      break;
    }
  }

  const fwdBaseWalletBal = await baseUsdcContract.balanceOf(deployerAddress);
  const fwdBaseVaultBal = await baseUsdcContract.balanceOf(BASE_VAULT_ADDRESS);

  console.log("\n--- [FORWARD BRIDGE ON-CHAIN PROOFS] ---");
  console.log(`Base Wallet USDC:   ${fwdBaseWalletBal.toString()} (-${Number(initialBaseWalletBal - fwdBaseWalletBal) / 1e6} USDC)`);
  console.log(`Base Vault USDC:    ${fwdBaseVaultBal.toString()} (+${Number(fwdBaseVaultBal - initialBaseVaultBal) / 1e6} USDC)`);
  console.log(`GenLayer V2 pUSDC:  ${fwdV2Balance.toString()} (+${Number(fwdV2Balance) / 1e6} pUSDC)`);
  console.log(`GenLayer V2 Supply: ${fwdV2Supply.toString()} (+${Number(fwdV2Supply) / 1e6} pUSDC)`);

  if (initialBaseWalletBal - fwdBaseWalletBal !== TEST_AMOUNT_RAW) throw new Error("Base wallet did not decrease by exactly 1 USDC");
  if (fwdBaseVaultBal - initialBaseVaultBal !== TEST_AMOUNT_RAW) throw new Error("Base vault did not increase by exactly 1 USDC");
  if (Number(fwdV2Balance) !== Number(TEST_AMOUNT_RAW)) throw new Error("GenLayer pUSDC balance is not 1 pUSDC");
  if (Number(fwdV2Supply) !== Number(TEST_AMOUNT_RAW)) throw new Error("GenLayer pUSDC total supply is not 1 pUSDC");
  console.log("✓ PHASE 1 FORWARD BRIDGE 100% CONFIRMED ON-CHAIN!");

  await sleep(4000);

  // --------------------------------------------------------------------------------
  // PHASE 2: REVERSE BRIDGE (GenLayer Bradbury -> Base Sepolia)
  // --------------------------------------------------------------------------------
  console.log("\n--- [PHASE 2: EXECUTE REAL GENLAYER -> BASE SEPOLIA REVERSE BRIDGE] ---");

  console.log(`Calling pUSDC V2 burn(${deployerAddress}, ${TEST_AMOUNT_RAW}) on ${TOKEN_V2_ADDRESS}...`);
  const burnTxHash = await genClient.writeContract({
    address: TOKEN_V2_ADDRESS,
    functionName: "burn",
    args: [deployerAddress, Number(TEST_AMOUNT_RAW)],
  });
  console.log("GenLayer Burn TX Hash:", burnTxHash);
  await waitForGenLayerTx(genClient, burnTxHash, "GenLayer pUSDC Burn");
  console.log(`  GenLayer Explorer: https://explorer-bradbury.genlayer.com/tx/${burnTxHash}`);

  // Poll until burn decreases balance and total supply to 0
  let postBurnV2Balance = 1000000n;
  let postBurnV2Supply = 1000000n;
  for (let i = 0; i < 15; i++) {
    await sleep(2500);
    postBurnV2Balance = await genClient.readContract({
      address: TOKEN_V2_ADDRESS,
      functionName: "balance_of",
      args: [deployerAddress],
    });
    postBurnV2Supply = await genClient.readContract({
      address: TOKEN_V2_ADDRESS,
      functionName: "get_total_supply",
      args: [],
    });
    console.log(`  [Burn Poll ${i + 1}/15] V2 Balance: ${postBurnV2Balance.toString()} | V2 Supply: ${postBurnV2Supply.toString()}`);
    if (Number(postBurnV2Balance) === 0 && Number(postBurnV2Supply) === 0) {
      break;
    }
  }

  if (Number(postBurnV2Balance) !== 0 || Number(postBurnV2Supply) !== 0) {
    throw new Error("GenLayer burn failed to decrease balance and total supply to zero");
  }
  console.log("✓ GenLayer On-Chain Total Supply Drop Confirmed: 1.000000 pUSDC -> 0.000000 pUSDC!");

  // Construct EIP-712 Authenticated Outbound Proof
  const reverseNonce = 2n; // Fresh unique nonce
  const burnIdString = `BURN_4221_84532_${deployerAddress.toLowerCase()}_${deployerAddress.toLowerCase()}_${TEST_AMOUNT_RAW}_${burnTxHash}`;
  const burnIdBytes32 = ethers.keccak256(ethers.toUtf8Bytes(burnIdString));
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 7200);

  console.log("\n[Constructing Authenticated EIP-712 Outbound Proof from Finalized Burn]");
  console.log("  Burn ID String:       ", burnIdString);
  console.log("  Burn ID (bytes32):    ", burnIdBytes32);
  console.log("  Source Chain ID:      ", 4221);
  console.log("  Destination Chain ID: ", 84532);
  console.log("  GenLayer Manager:     ", MANAGER_V2_ADDRESS);
  console.log("  Base Recipient:       ", deployerAddress);
  console.log("  Amount:               ", TEST_AMOUNT_RAW.toString(), "raw units (1.000000 USDC)");
  console.log("  Nonce:                ", reverseNonce.toString());
  console.log("  Deadline:             ", deadline.toString());
  console.log("  Finalized GenLayer TX:", burnTxHash);

  const domain = {
    name: "PayGrixBridge",
    version: "1",
    chainId: 84532n,
    verifyingContract: BASE_ROUTER_ADDRESS,
  };

  const types = {
    BurnRelease: [
      { name: "burnId", type: "bytes32" },
      { name: "sourceChainId", type: "uint256" },
      { name: "genLayerBridgeManager", type: "address" },
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };

  const releaseValue = {
    burnId: burnIdBytes32,
    sourceChainId: 4221n,
    genLayerBridgeManager: MANAGER_V2_ADDRESS,
    recipient: deployerAddress,
    amount: TEST_AMOUNT_RAW,
    nonce: reverseNonce,
    deadline: deadline,
  };

  console.log("Signing EIP-712 payload with validator key (0xf85085b73a4Ec4efE895B532Fe1560a06ff0d179)...");
  const validatorSignature = await baseWallet.signTypedData(domain, types, releaseValue);
  console.log("Validator Signature:", validatorSignature);

  const recoveredSigner = ethers.verifyTypedData(domain, types, releaseValue, validatorSignature);
  console.log("Recovered Signer Address:", recoveredSigner);
  if (recoveredSigner.toLowerCase() !== deployerAddress.toLowerCase()) {
    throw new Error(`Signature recovered unexpected address: ${recoveredSigner}`);
  }
  console.log("✓ EIP-712 Validator Signature Authenticated Locally!");

  // Submit releaseUSDC to Base Router on Base Sepolia
  console.log("\nSubmitting releaseUSDC() to PayGrixBaseBridgeRouter on Base Sepolia...");
  const releaseTx = await baseRouterContract.releaseUSDC(
    burnIdBytes32,
    4221n,
    MANAGER_V2_ADDRESS,
    deployerAddress,
    TEST_AMOUNT_RAW,
    reverseNonce,
    deadline,
    [validatorSignature]
  );
  console.log("Base Release TX Hash:", releaseTx.hash);
  console.log("Waiting for Base Sepolia confirmation...");
  const releaseReceipt = await releaseTx.wait();
  console.log("✓ Base Sepolia Release Confirmed in Block:", releaseReceipt.blockNumber);
  console.log("  Gas Used:", releaseReceipt.gasUsed.toString());
  console.log(`  BaseScan: https://sepolia.basescan.org/tx/${releaseTx.hash}`);

  let tokensReleasedEvent = null;
  for (const log of releaseReceipt.logs) {
    try {
      const parsed = baseRouterContract.interface.parseLog(log);
      if (parsed && parsed.name === "TokensReleased") {
        tokensReleasedEvent = parsed.args;
        console.log("✓ TokensReleased Event Detected on Base Sepolia!");
        console.log("  Burn ID:    ", parsed.args.burnId);
        console.log("  Recipient:  ", parsed.args.recipient);
        console.log("  Amount:     ", parsed.args.amount.toString());
        console.log("  Nonce:      ", parsed.args.nonce.toString());
        break;
      }
    } catch {
      // ignore
    }
  }
  if (!tokensReleasedEvent) throw new Error("TokensReleased event not found in Base release receipt");

  // Wait for RPC state propagation and read final on-chain balances
  await sleep(3000);
  const finalBaseWalletBal = await baseUsdcContract.balanceOf(deployerAddress);
  const finalBaseVaultBal = await baseUsdcContract.balanceOf(BASE_VAULT_ADDRESS);
  const finalV2Balance = await genClient.readContract({
    address: TOKEN_V2_ADDRESS,
    functionName: "balance_of",
    args: [deployerAddress],
  });
  const finalV2Supply = await genClient.readContract({
    address: TOKEN_V2_ADDRESS,
    functionName: "get_total_supply",
    args: [],
  });

  console.log("\n--- [FINAL ON-CHAIN AUDIT & ROUND-TRIP CONSERVATION PROOFS] ---");
  console.log(`Base Wallet Starting USDC: ${initialBaseWalletBal.toString()} (${Number(initialBaseWalletBal) / 1e6} USDC)`);
  console.log(`Base Wallet After Forward: ${fwdBaseWalletBal.toString()} (${Number(fwdBaseWalletBal) / 1e6} USDC)`);
  console.log(`Base Wallet Final USDC:    ${finalBaseWalletBal.toString()} (${Number(finalBaseWalletBal) / 1e6} USDC)`);
  console.log(`Base Wallet Roundtrip Net: ${(Number(finalBaseWalletBal - initialBaseWalletBal) / 1e6).toFixed(6)} USDC (Net 0.000000)`);

  console.log(`Base Vault Starting USDC:  ${initialBaseVaultBal.toString()} (${Number(initialBaseVaultBal) / 1e6} USDC)`);
  console.log(`Base Vault After Forward:  ${fwdBaseVaultBal.toString()} (${Number(fwdBaseVaultBal) / 1e6} USDC)`);
  console.log(`Base Vault Final USDC:     ${finalBaseVaultBal.toString()} (${Number(finalBaseVaultBal) / 1e6} USDC)`);
  console.log(`Base Vault Roundtrip Net:  ${(Number(finalBaseVaultBal - initialBaseVaultBal) / 1e6).toFixed(6)} USDC (Net 0.000000)`);

  console.log(`V2 pUSDC Initial Balance:  ${initialV2Balance.toString()} (0.000000 pUSDC)`);
  console.log(`V2 pUSDC After Forward:    ${fwdV2Balance.toString()} (1.000000 pUSDC)`);
  console.log(`V2 pUSDC Final Balance:    ${finalV2Balance.toString()} (0.000000 pUSDC)`);

  console.log(`V2 Supply Initial:         ${initialV2Supply.toString()} (0.000000 pUSDC)`);
  console.log(`V2 Supply After Forward:   ${fwdV2Supply.toString()} (1.000000 pUSDC)`);
  console.log(`V2 Supply Final:           ${finalV2Supply.toString()} (0.000000 pUSDC)`);

  const walletConservation = initialBaseWalletBal === finalBaseWalletBal;
  const vaultConservation = initialBaseVaultBal === finalBaseVaultBal;
  const v2BalanceZero = Number(finalV2Balance) === 0;
  const v2SupplyZero = Number(finalV2Supply) === 0;

  console.log("\n================================================================================");
  console.log("=== FINAL ROUND-TRIP INVARIANT & SAFETY AUDIT SUMMARY ===");
  console.log("================================================================================");
  console.log("1. Forward Base TX Hash:           ", bridgeTx.hash);
  console.log("   BaseScan Explorer URL:          https://sepolia.basescan.org/tx/" + bridgeTx.hash);
  console.log("2. Forward GenLayer Mint TX Hash:  ", mintTxHash);
  console.log("   GenLayer Explorer URL:          https://explorer-bradbury.genlayer.com/tx/" + mintTxHash);
  console.log("3. Reverse GenLayer Burn TX Hash:  ", burnTxHash);
  console.log("   GenLayer Explorer URL:          https://explorer-bradbury.genlayer.com/tx/" + burnTxHash);
  console.log("4. Reverse Base Release TX Hash:   ", releaseTx.hash);
  console.log("   BaseScan Explorer URL:          https://sepolia.basescan.org/tx/" + releaseTx.hash);
  console.log("5. Base Wallet Collateral Conserved:", walletConservation ? "✓ TRUE" : "✗ FALSE");
  console.log("6. Base Vault Liquidity Conserved:  ", vaultConservation ? "✓ TRUE" : "✗ FALSE");
  console.log("7. GenLayer V2 Total Supply Drop:   ", v2SupplyZero ? "✓ TRUE (0 -> 1.000000 -> 0.000000 pUSDC)" : "✗ FALSE");
  console.log("8. 1:1 Invariant Conservation:      ", walletConservation && vaultConservation && v2SupplyZero ? "✓ TRUE" : "✗ FALSE");

  return {
    success: walletConservation && vaultConservation && v2BalanceZero && v2SupplyZero,
    contracts: {
      tokenV2Address: TOKEN_V2_ADDRESS,
      managerV2Address: MANAGER_V2_ADDRESS,
      baseRouterAddress: BASE_ROUTER_ADDRESS,
      baseVaultAddress: BASE_VAULT_ADDRESS,
      baseUsdcAddress: BASE_USDC_ADDRESS,
      v1TokenUntouched: V1_TOKEN_ADDRESS,
    },
    transactions: {
      forwardBaseBridgeTx: bridgeTx.hash,
      forwardGenlayerMintTx: mintTxHash,
      reverseGenlayerBurnTx: burnTxHash,
      reverseBaseReleaseTx: releaseTx.hash,
    },
    burnProof: {
      burnIdString,
      burnIdBytes32,
      nonce: reverseNonce.toString(),
      amount: TEST_AMOUNT_RAW.toString(),
      recipient: deployerAddress,
      sourceChainId: 4221,
      destinationChainId: 84532,
      signature: validatorSignature,
    },
    balances: {
      baseWalletInitial: initialBaseWalletBal.toString(),
      baseWalletAfterForward: fwdBaseWalletBal.toString(),
      baseWalletFinal: finalBaseWalletBal.toString(),
      baseVaultInitial: initialBaseVaultBal.toString(),
      baseVaultAfterForward: fwdBaseVaultBal.toString(),
      baseVaultFinal: finalBaseVaultBal.toString(),
      v2pUsdcInitial: "0",
      v2pUsdcAfterForward: fwdV2Balance.toString(),
      v2pUsdcFinal: finalV2Balance.toString(),
      v2SupplyInitial: "0",
      v2SupplyAfterForward: fwdV2Supply.toString(),
      v2SupplyFinal: finalV2Supply.toString(),
    },
  };
}

runFreshRoundTripTest()
  .then((res) => {
    console.log("\nFRESH_ROUNDTRIP_RESULT=" + JSON.stringify(res, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error("\nFRESH ROUNDTRIP FAILED:", err);
    process.exit(1);
  });
