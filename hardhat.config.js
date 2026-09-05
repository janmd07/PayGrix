require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// Default dummy private key if env variable is not set to allow compilation/local operations
const privateKey = process.env.PRIVATE_KEY || "";

const accounts = privateKey && privateKey.match(/^(0x)?[0-9a-fA-F]{64}$/) ? [privateKey] : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    arcTestnet: {
      url: "https://rpc.testnet.arc.network",
      chainId: 5042002,
      accounts: accounts,
    },
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      chainId: 84532,
      accounts: accounts,
    },
  },
  etherscan: {
    apiKey: {
      arcTestnet: "any-string-works",
    },
    customChains: [
      {
        network: "arcTestnet",
        chainId: 5042002,
        urls: {
          apiURL: "https://testnet.arcscan.app/api",
          browserURL: "https://testnet.arcscan.app",
        },
      },
    ],
  },
};
