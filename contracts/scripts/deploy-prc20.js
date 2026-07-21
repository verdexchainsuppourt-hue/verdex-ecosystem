/**
 * Deploy PRC20Token to Verdex (chainId 7201).
 *
 * Usage:
 *   cd contracts
 *   npm install
 *   set PRIVATE_KEY=0x...
 *   npm run deploy:prc20
 *
 * Or local Hardhat:
 *   npm run deploy:local
 */
const hre = require('hardhat');

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();

  console.log('═══════════════════════════════════════════');
  console.log(' Verdex PRC20 Deploy');
  console.log('═══════════════════════════════════════════');
  console.log(' Network:   ', network.name, '(chainId', network.chainId.toString() + ')');
  console.log(' Deployer:  ', deployer.address);
  console.log(' Balance:   ', hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), 'VDX');

  const name = process.env.TOKEN_NAME || 'Verdex Utility Token';
  const symbol = process.env.TOKEN_SYMBOL || 'VDXU';
  const decimals = parseInt(process.env.TOKEN_DECIMALS || '18', 10);
  const supply = process.env.TOKEN_SUPPLY || '10000000'; // 10M whole tokens

  const Factory = await hre.ethers.getContractFactory('PRC20Token');
  const token = await Factory.deploy(name, symbol, decimals, supply, deployer.address);
  await token.waitForDeployment();

  const address = await token.getAddress();
  console.log('');
  console.log(' ✅ PRC20 deployed');
  console.log('    Name:    ', name);
  console.log('    Symbol:  ', symbol);
  console.log('    Decimals:', decimals);
  console.log('    Supply:  ', supply, symbol);
  console.log('    Address: ', address);
  console.log('');
  console.log(' MetaMask: Import token with this address on Verdex Testnet (7201).');
  console.log(' Note: DEX listing / auto-pool is Phase 4 (not deployed).');
  console.log('═══════════════════════════════════════════');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
