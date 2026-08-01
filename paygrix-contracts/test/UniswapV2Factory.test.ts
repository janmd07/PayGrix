import { expect } from "chai";
import { ethers } from "hardhat";
import { UniswapV2Factory } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("UniswapV2Factory Unit Tests", function () {
  let factory: UniswapV2Factory;
  let owner: SignerWithAddress;
  let otherAccount: SignerWithAddress;

  const TOKEN_A = "0x1000000000000000000000000000000000000001";
  const TOKEN_B = "0x2000000000000000000000000000000000000002";
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  beforeEach(async function () {
    [owner, otherAccount] = await ethers.getSigners();
    const FactoryFactory = await ethers.getContractFactory("UniswapV2Factory");
    factory = (await FactoryFactory.deploy(owner.address)) as UniswapV2Factory;
    await factory.waitForDeployment();
  });

  it("1. Should set feeToSetter to deployment account", async function () {
    expect(await factory.feeToSetter()).to.equal(owner.address);
  });

  it("2. Should set feeTo to zero address initially", async function () {
    expect(await factory.feeTo()).to.equal(ZERO_ADDRESS);
  });

  it("3. Should initialize allPairsLength at zero", async function () {
    expect(await factory.allPairsLength()).to.equal(0n);
  });

  it("4. Should create a new pair successfully", async function () {
    await expect(factory.createPair(TOKEN_A, TOKEN_B))
      .to.emit(factory, "PairCreated");

    expect(await factory.allPairsLength()).to.equal(1n);

    const pairAddress = await factory.getPair(TOKEN_A, TOKEN_B);
    expect(pairAddress).to.not.equal(ZERO_ADDRESS);
    expect(await factory.getPair(TOKEN_B, TOKEN_A)).to.equal(pairAddress);
    expect(await factory.allPairs(0)).to.equal(pairAddress);
  });

  it("5. Should revert when creating duplicate pair", async function () {
    await factory.createPair(TOKEN_A, TOKEN_B);
    await expect(factory.createPair(TOKEN_A, TOKEN_B)).to.be.revertedWith("UniswapV2: PAIR_EXISTS");
  });

  it("6. Should revert when creating pair with zero-address token", async function () {
    await expect(factory.createPair(ZERO_ADDRESS, TOKEN_A)).to.be.revertedWith("UniswapV2: ZERO_ADDRESS");
  });

  it("7. Should revert when creating pair with identical tokens", async function () {
    await expect(factory.createPair(TOKEN_A, TOKEN_A)).to.be.revertedWith("UniswapV2: IDENTICAL_ADDRESSES");
  });

  it("8. Should restrict setFeeTo to feeToSetter only", async function () {
    await expect(factory.connect(otherAccount).setFeeTo(otherAccount.address))
      .to.be.revertedWith("UniswapV2: FORBIDDEN");

    await factory.connect(owner).setFeeTo(otherAccount.address);
    expect(await factory.feeTo()).to.equal(otherAccount.address);
  });

  it("9. Should restrict setFeeToSetter to feeToSetter only", async function () {
    await expect(factory.connect(otherAccount).setFeeToSetter(otherAccount.address))
      .to.be.revertedWith("UniswapV2: FORBIDDEN");

    await factory.connect(owner).setFeeToSetter(otherAccount.address);
    expect(await factory.feeToSetter()).to.equal(otherAccount.address);
  });
});
