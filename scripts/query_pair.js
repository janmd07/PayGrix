const hre = require("hardhat");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const PAIR_ADDRESS = "0xf9d04BDdA9C857C9440ac9eD6EbB9118686Ef7b2";
  const abi = [
    "function decimals() external view returns (uint8)",
    "function totalSupply() external view returns (uint256)",
    "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
    "function name() external view returns (string)",
    "function symbol() external view returns (string)"
  ];
  
  const provider = new hre.ethers.JsonRpcProvider("https://rpc.testnet.arc.network");
  const pair = new hre.ethers.Contract(PAIR_ADDRESS, abi, provider);

  console.log("Querying Pair contract on Arc Testnet with sequential delays...");
  try {
    const decimals = await pair.decimals();
    console.log("Decimals:", decimals);
    await sleep(2000);
    
    const totalSupply = await pair.totalSupply();
    console.log("Total Supply:", totalSupply.toString());
    await sleep(2000);
    
    const reserves = await pair.getReserves();
    console.log("Reserve0:", reserves.reserve0.toString());
    console.log("Reserve1:", reserves.reserve1.toString());
    await sleep(2000);
    
    const name = await pair.name();
    console.log("Name:", name);
    await sleep(2000);
    
    const symbol = await pair.symbol();
    console.log("Symbol:", symbol);
  } catch (err) {
    console.error("Error querying Pair:", err);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
