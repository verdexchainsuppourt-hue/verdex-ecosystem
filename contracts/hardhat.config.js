require('@nomicfoundation/hardhat-toolbox');

const mainnetChainId = process.env.VERDEX_MAINNET_CHAIN_ID
  ? Number(process.env.VERDEX_MAINNET_CHAIN_ID)
  : undefined;

const verdexMainnet = {
  url: process.env.VDX_RPC_URL || 'http://127.0.0.1:8545',
  accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : []
};
if (Number.isSafeInteger(mainnetChainId) && mainnetChainId > 0 && mainnetChainId !== 7201) {
  verdexMainnet.chainId = mainnetChainId;
}

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: '0.8.20',
    settings: {
      optimizer: { enabled: true, runs: 200 }
    }
  },
  networks: {
    hardhat: {
      chainId: 31337
    },
    verdexMainnet
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts'
  }
};
