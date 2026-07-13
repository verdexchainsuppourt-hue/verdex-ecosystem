require('@nomicfoundation/hardhat-toolbox');

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
      chainId: 7201
    },
    verdex: {
      url: process.env.VERDEX_RPC_URL || 'https://verdex-ecosystem-production.up.railway.app/rpc',
      chainId: 7201,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : []
    },
    verdexLocal: {
      url: process.env.VERDEX_LOCAL_RPC || 'http://127.0.0.1:8545',
      chainId: 7201,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : []
    }
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts'
  }
};
