/**
 * Deploy Verdex AMM stack:
 *   WVDX → Factory → FeeSplitter → Router → Aggregator
 *
 * Usage:
 *   npx hardhat run scripts/deploy-amm.js --network hardhat
 *   npx hardhat run scripts/deploy-amm.js --network verdex
 *
 * Env:
 *   PRIVATE_KEY   — deployer (verdex network)
 *   TREASURY      — protocol treasury address (default: deployer)
 *   BURN_ADDRESS  — default 0x...dEaD
 */
const fs = require('fs');
const path = require('path');
const hre = require('hardhat');

const DEAD = '0x000000000000000000000000000000000000dEaD';

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const treasury = process.env.TREASURY || deployer.address;
  const burn = process.env.BURN_ADDRESS || DEAD;

  console.log('Deployer:', deployer.address);
  console.log('Network:', hre.network.name, 'chainId', (await hre.ethers.provider.getNetwork()).chainId);
  console.log('Treasury:', treasury);
  console.log('Burn:', burn);

  const WVDX = await hre.ethers.getContractFactory('WVDX');
  const wvdX = await WVDX.deploy();
  await wvdX.waitForDeployment();
  console.log('WVDX:', await wvdX.getAddress());

  const Factory = await hre.ethers.getContractFactory('VerdexFactory');
  const factory = await Factory.deploy(deployer.address, treasury, burn);
  await factory.waitForDeployment();
  console.log('VerdexFactory:', await factory.getAddress());

  const FeeSplitter = await hre.ethers.getContractFactory('VerdexFeeSplitter');
  const feeSplitter = await FeeSplitter.deploy(await factory.getAddress());
  await feeSplitter.waitForDeployment();
  await (await factory.setFeeTo(await feeSplitter.getAddress())).wait();
  console.log('VerdexFeeSplitter (feeTo):', await feeSplitter.getAddress());

  const Router = await hre.ethers.getContractFactory('VerdexRouter');
  const router = await Router.deploy(await factory.getAddress(), await wvdX.getAddress());
  await router.waitForDeployment();
  console.log('VerdexRouter:', await router.getAddress());

  const Aggregator = await hre.ethers.getContractFactory('VerdexAggregator');
  const aggregator = await Aggregator.deploy(
    await factory.getAddress(),
    await router.getAddress(),
    await wvdX.getAddress()
  );
  await aggregator.waitForDeployment();
  console.log('VerdexAggregator:', await aggregator.getAddress());

  // Compute pair init code hash for off-chain pairFor helpers
  const pairArtifact = await hre.artifacts.readArtifact('VerdexPair');
  const initCodeHash = hre.ethers.keccak256(pairArtifact.bytecode);
  console.log('VerdexPair init code hash:', initCodeHash);

  const deployment = {
    network: hre.network.name,
    chainId: Number((await hre.ethers.provider.getNetwork()).chainId),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    fees: {
      totalBps: 25,
      lpBps: 17,
      treasuryBps: 5,
      burnBps: 3,
      formula: 'x * y = k',
      amountOut: '(amountIn * 9975 * reserveOut) / (reserveIn * 10000 + amountIn * 9975)'
    },
    contracts: {
      WVDX: await wvdX.getAddress(),
      VerdexFactory: await factory.getAddress(),
      VerdexFeeSplitter: await feeSplitter.getAddress(),
      VerdexRouter: await router.getAddress(),
      VerdexAggregator: await aggregator.getAddress()
    },
    config: {
      treasury,
      burnAddress: burn,
      feeTo: await feeSplitter.getAddress(),
      pairInitCodeHash: initCodeHash
    }
  };

  const outDir = path.join(__dirname, '..', 'deployments');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${hre.network.name}-amm.json`);
  fs.writeFileSync(outFile, JSON.stringify(deployment, null, 2));
  console.log('\nWrote', outFile);
  console.log(JSON.stringify(deployment, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
