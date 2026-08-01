import { expect } from "chai";
import { ethers } from "hardhat";
import {
  UniswapV2Factory,
  PayGrixArcRouter,
  MockERC20,
  UniswapV2Pair__factory,
} from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("PayGrixArcRouter Unit Tests (ERC20-Only)", function () {
  let factory: UniswapV2Factory;
  let router: PayGrixArcRouter;
  let usdc: MockERC20;
  let eurc: MockERC20;
  let tokenC: MockERC20;
  let owner: SignerWithAddress;
  let user: SignerWithAddress;

  const MAX_UINT = ethers.MaxUint256;

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();

    // 1. Deploy Factory
    const FactoryFactory = await ethers.getContractFactory("UniswapV2Factory");
    factory = (await FactoryFactory.deploy(owner.address)) as UniswapV2Factory;
    await factory.waitForDeployment();

    // 2. Deploy Router
    const RouterFactory = await ethers.getContractFactory("PayGrixArcRouter");
    router = (await RouterFactory.deploy(await factory.getAddress())) as PayGrixArcRouter;
    await router.waitForDeployment();

    // 3. Deploy 6-decimal Mock ERC20 Tokens (1,000,000 raw units = 1 token)
    const MockFactory = await ethers.getContractFactory("MockERC20");
    usdc = (await MockFactory.deploy("USD Coin", "USDC", 6, 100_000_000_000n)) as MockERC20; // 100,000 USDC
    eurc = (await MockFactory.deploy("Euro Coin", "EURC", 6, 100_000_000_000n)) as MockERC20; // 100,000 EURC
    tokenC = (await MockFactory.deploy("Token C", "TKNC", 6, 100_000_000_000n)) as MockERC20; // 100,000 TKNC

    await usdc.waitForDeployment();
    await eurc.waitForDeployment();
    await tokenC.waitForDeployment();

    // Approve Router to spend tokens for owner and user
    await usdc.approve(await router.getAddress(), MAX_UINT);
    await eurc.approve(await router.getAddress(), MAX_UINT);
    await tokenC.approve(await router.getAddress(), MAX_UINT);

    await usdc.mint(user.address, 10_000_000_000n); // 10,000 USDC
    await eurc.mint(user.address, 10_000_000_000n); // 10,000 EURC
    await tokenC.mint(user.address, 10_000_000_000n);

    await usdc.connect(user).approve(await router.getAddress(), MAX_UINT);
    await eurc.connect(user).approve(await router.getAddress(), MAX_UINT);
    await tokenC.connect(user).approve(await router.getAddress(), MAX_UINT);
  });

  it("1. Router stores the correct Factory address", async function () {
    expect(await router.factory()).to.equal(await factory.getAddress());
  });

  it("2. No WETH/native-token state or callable paths exist", async function () {
    const routerContract = router as unknown as Record<string, unknown>;
    expect(routerContract.WETH).to.be.undefined;
    expect(routerContract.addLiquidityETH).to.be.undefined;
    expect(routerContract.swapExactETHForTokens).to.be.undefined;
  });

  it("3. Creates a tokenA/tokenB pair through addLiquidity", async function () {
    const usdcAddr = await usdc.getAddress();
    const eurcAddr = await eurc.getAddress();

    expect(await factory.getPair(usdcAddr, eurcAddr)).to.equal(ethers.ZeroAddress);

    const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 3600;
    await router.addLiquidity(
      usdcAddr,
      eurcAddr,
      1_000_000_000n, // 1,000 USDC
      1_000_000_000n, // 1,000 EURC
      1_000_000n,
      1_000_000n,
      owner.address,
      deadline
    );

    const pairAddr = await factory.getPair(usdcAddr, eurcAddr);
    expect(pairAddr).to.not.equal(ethers.ZeroAddress);
  });

  it("4 & 5. Adds initial liquidity successfully and mints LP tokens", async function () {
    const usdcAddr = await usdc.getAddress();
    const eurcAddr = await eurc.getAddress();
    const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 3600;

    await router.addLiquidity(
      usdcAddr,
      eurcAddr,
      10_000_000_000n, // 10,000 USDC
      10_000_000_000n, // 10,000 EURC
      0n,
      0n,
      owner.address,
      deadline
    );

    const pairAddr = await factory.getPair(usdcAddr, eurcAddr);
    const pair = await ethers.getContractAt("UniswapV2Pair", pairAddr);
    const lpBalance = await pair.balanceOf(owner.address);

    expect(lpBalance).to.be.gt(0n);
  });

  it("6. Adds liquidity using the correct reserve ratio", async function () {
    const usdcAddr = await usdc.getAddress();
    const eurcAddr = await eurc.getAddress();
    const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 3600;

    // Initial 10,000 : 10,000
    await router.addLiquidity(
      usdcAddr,
      eurcAddr,
      10_000_000_000n,
      10_000_000_000n,
      0n,
      0n,
      owner.address,
      deadline
    );

    // Adding 2,000 USDC and 2,000 EURC (exact 1:1 ratio)
    const [, amountB] = await router.addLiquidity.staticCall(
      usdcAddr,
      eurcAddr,
      2_000_000_000n,
      2_000_000_000n,
      0n,
      0n,
      owner.address,
      deadline
    );

    expect(amountB).to.equal(2_000_000_000n);
  });

  it("7. Reverts when amountAMin is not satisfied", async function () {
    const usdcAddr = await usdc.getAddress();
    const eurcAddr = await eurc.getAddress();
    const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 3600;

    await router.addLiquidity(usdcAddr, eurcAddr, 10_000_000_000n, 10_000_000_000n, 0n, 0n, owner.address, deadline);

    // Pass amountADesired high, amountBDesired low, and amountAMin higher than optimal amountA
    await expect(
      router.addLiquidity(
        usdcAddr,
        eurcAddr,
        2_000_000_000n,
        1_000_000_000n,
        2_000_000_000n, // Unachievable amountAMin
        0n,
        owner.address,
        deadline
      )
    ).to.be.revertedWith("PayGrixArcRouter: INSUFFICIENT_A_AMOUNT");
  });

  it("8. Reverts when amountBMin is not satisfied", async function () {
    const usdcAddr = await usdc.getAddress();
    const eurcAddr = await eurc.getAddress();
    const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 3600;

    await router.addLiquidity(usdcAddr, eurcAddr, 10_000_000_000n, 10_000_000_000n, 0n, 0n, owner.address, deadline);

    await expect(
      router.addLiquidity(
        usdcAddr,
        eurcAddr,
        1_000_000_000n,
        1_000_000_000n,
        0n,
        2_000_000_000n, // Unachievable amountBMin
        owner.address,
        deadline
      )
    ).to.be.revertedWith("PayGrixArcRouter: INSUFFICIENT_B_AMOUNT");
  });

  it("9 & 10. Removes liquidity successfully and respects minimums", async function () {
    const usdcAddr = await usdc.getAddress();
    const eurcAddr = await eurc.getAddress();
    const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 3600;

    await router.addLiquidity(usdcAddr, eurcAddr, 10_000_000_000n, 10_000_000_000n, 0n, 0n, owner.address, deadline);

    const pairAddr = await factory.getPair(usdcAddr, eurcAddr);
    const pair = await ethers.getContractAt("UniswapV2Pair", pairAddr);
    const lpBalance = await pair.balanceOf(owner.address);

    await pair.approve(await router.getAddress(), MAX_UINT);

    await expect(
      router.removeLiquidity(usdcAddr, eurcAddr, lpBalance, 20_000_000_000n, 0n, owner.address, deadline)
    ).to.be.revertedWith("PayGrixArcRouter: INSUFFICIENT_A_AMOUNT");

    await router.removeLiquidity(usdcAddr, eurcAddr, lpBalance, 0n, 0n, owner.address, deadline);
    expect(await pair.balanceOf(owner.address)).to.equal(0n);
  });

  it("11. swapExactTokensForTokens succeeds", async function () {
    const usdcAddr = await usdc.getAddress();
    const eurcAddr = await eurc.getAddress();
    const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 3600;

    await router.addLiquidity(usdcAddr, eurcAddr, 10_000_000_000n, 10_000_000_000n, 0n, 0n, owner.address, deadline);

    const amountIn = 100_000n; // 0.10 USDC
    const eurcBefore = await eurc.balanceOf(user.address);

    await router.connect(user).swapExactTokensForTokens(
      amountIn,
      0n,
      [usdcAddr, eurcAddr],
      user.address,
      deadline
    );

    const eurcAfter = await eurc.balanceOf(user.address);
    expect(eurcAfter).to.be.gt(eurcBefore);
  });

  it("12. swapTokensForExactTokens succeeds", async function () {
    const usdcAddr = await usdc.getAddress();
    const eurcAddr = await eurc.getAddress();
    const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 3600;

    await router.addLiquidity(usdcAddr, eurcAddr, 10_000_000_000n, 10_000_000_000n, 0n, 0n, owner.address, deadline);

    const amountOut = 50_000n; // 0.05 EURC
    const eurcBefore = await eurc.balanceOf(user.address);

    await router.connect(user).swapTokensForExactTokens(
      amountOut,
      1_000_000n, // Max 1.0 USDC
      [usdcAddr, eurcAddr],
      user.address,
      deadline
    );

    const eurcAfter = await eurc.balanceOf(user.address);
    expect(eurcAfter - eurcBefore).to.equal(amountOut);
  });

  it("13. Multi-hop ERC20 swap succeeds (USDC -> EURC -> TKNC)", async function () {
    const usdcAddr = await usdc.getAddress();
    const eurcAddr = await eurc.getAddress();
    const tkncAddr = await tokenC.getAddress();
    const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 3600;

    await router.addLiquidity(usdcAddr, eurcAddr, 10_000_000_000n, 10_000_000_000n, 0n, 0n, owner.address, deadline);
    await router.addLiquidity(eurcAddr, tkncAddr, 10_000_000_000n, 10_000_000_000n, 0n, 0n, owner.address, deadline);

    const tkncBefore = await tokenC.balanceOf(user.address);

    await router.connect(user).swapExactTokensForTokens(
      100_000n,
      0n,
      [usdcAddr, eurcAddr, tkncAddr],
      user.address,
      deadline
    );

    const tkncAfter = await tokenC.balanceOf(user.address);
    expect(tkncAfter).to.be.gt(tkncBefore);
  });

  it("14. Expired deadline reverts", async function () {
    const usdcAddr = await usdc.getAddress();
    const eurcAddr = await eurc.getAddress();
    const pastDeadline = (await ethers.provider.getBlock("latest"))!.timestamp - 3600;

    await expect(
      router.addLiquidity(usdcAddr, eurcAddr, 1_000_000n, 1_000_000n, 0n, 0n, owner.address, pastDeadline)
    ).to.be.revertedWith("PayGrixArcRouter: EXPIRED");
  });

  it("15. Insufficient output amount reverts", async function () {
    const usdcAddr = await usdc.getAddress();
    const eurcAddr = await eurc.getAddress();
    const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 3600;

    await router.addLiquidity(usdcAddr, eurcAddr, 10_000_000_000n, 10_000_000_000n, 0n, 0n, owner.address, deadline);

    await expect(
      router.connect(user).swapExactTokensForTokens(
        100_000n,
        1_000_000n, // Unachievable min output
        [usdcAddr, eurcAddr],
        user.address,
        deadline
      )
    ).to.be.revertedWith("PayGrixArcRouter: INSUFFICIENT_OUTPUT_AMOUNT");
  });

  it("16. Excessive input amount reverts", async function () {
    const usdcAddr = await usdc.getAddress();
    const eurcAddr = await eurc.getAddress();
    const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 3600;

    await router.addLiquidity(usdcAddr, eurcAddr, 10_000_000_000n, 10_000_000_000n, 0n, 0n, owner.address, deadline);

    await expect(
      router.connect(user).swapTokensForExactTokens(
        500_000n,
        100n, // Impossible low max input
        [usdcAddr, eurcAddr],
        user.address,
        deadline
      )
    ).to.be.revertedWith("PayGrixArcRouter: EXCESSIVE_INPUT_AMOUNT");
  });

  it("17. USDC/EURC 6-decimal tokens operate accurately (1 token = 1,000,000 units)", async function () {
    const usdcAddr = await usdc.getAddress();
    const eurcAddr = await eurc.getAddress();
    const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 3600;

    // 1 USDC = 1,000,000 units
    const oneUsdc = 1_000_000n;
    const oneEurc = 1_000_000n;

    await router.addLiquidity(usdcAddr, eurcAddr, oneUsdc * 1000n, oneEurc * 1000n, 0n, 0n, owner.address, deadline);

    const amountsOut = await router.getAmountsOut(oneUsdc, [usdcAddr, eurcAddr]);
    expect(amountsOut[0]).to.equal(oneUsdc);
    expect(amountsOut[1]).to.be.closeTo(997_000n, 1000n); // ~0.997 EURC after 0.3% fee
  });

  it("18. Router does not accept or depend on native ETH value", async function () {
    const usdcAddr = await usdc.getAddress();
    const eurcAddr = await eurc.getAddress();
    const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 3600;

    await expect(
      user.sendTransaction({
        to: await router.getAddress(),
        value: ethers.parseEther("1.0"),
      })
    ).to.be.reverted;
  });

  it("19. Pair creation-code init hash verification", async function () {
    const pairBytecode = UniswapV2Pair__factory.bytecode;
    const computedHash = ethers.keccak256(pairBytecode);
    const expectedHash = "0xc6a44fe3c1e7083957b7fff0660555c6ff70da1aa738095a17993f0dec93a045";

    console.log("   Computed Pair Init-Code Hash:", computedHash);
    console.log("   Expected UniswapV2Library Hash:", expectedHash);

    expect(computedHash.toLowerCase()).to.equal(expectedHash.toLowerCase());
  });
});
