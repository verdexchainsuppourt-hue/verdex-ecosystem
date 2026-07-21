const hre = require('hardhat');
const { createHash } = require('crypto');

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log('Deploying with:', deployer.address);

  // VDX already deployed
  const vdxAddress = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
  console.log('VDX Token:', vdxAddress);

  // Get the Hardhat test accounts with correct checksums from the provider
  const accounts = await hre.ethers.getSigners();
  const accountAddresses = accounts.map(a => a.address);
  console.log('Available accounts:', accountAddresses.length);

  // Use accounts[1], [2], [3] as arbiters and [4], [5] as attestors
  const arbiters = [accountAddresses[1], accountAddresses[2], accountAddresses[3]];
  const attestors = [accountAddresses[4], accountAddresses[5]];

  console.log('Arbiters:', arbiters.join(', '));
  console.log('Attestors:', attestors.join(', '));

  // Deploy P2P Escrow
  const Escrow = await hre.ethers.getContractFactory('VerdexP2PEscrow');
  const escrow = await Escrow.deploy(vdxAddress, deployer.address, arbiters, attestors, 2);
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  console.log('P2P Escrow:', escrowAddress);

  // Get runtime code hashes
  const vdxCode = await hre.ethers.provider.getCode(vdxAddress);
  const escrowCode = await hre.ethers.provider.getCode(escrowAddress);
  const vdxHash = createHash('sha256').update(Buffer.from(vdxCode.slice(2), 'hex')).digest('hex');
  const escrowHash = createHash('sha256').update(Buffer.from(escrowCode.slice(2), 'hex')).digest('hex');

  // Verify supply
  const VDX = await hre.ethers.getContractFactory('VerdexMainnetVDX');
  const vdx = VDX.attach(vdxAddress);
  const supply = await vdx.totalSupply();
  const balance = await vdx.balanceOf(deployer.address);

  console.log('');
  console.log('=== DEPLOYMENT COMPLETE ===');
  console.log('VDX_ADDRESS=' + vdxAddress);
  console.log('ESCROW_ADDRESS=' + escrowAddress);
  console.log('VDX_CODE_SHA256=' + vdxHash);
  console.log('ESCROW_CODE_SHA256=' + escrowHash);
  console.log('TOTAL_SUPPLY=' + hre.ethers.formatEther(supply) + ' VDX');
  console.log('DEPLOYER_BALANCE=' + hre.ethers.formatEther(balance) + ' VDX');
  console.log('CHAIN_ID=31337');
  console.log('RPC_URL=http://127.0.0.1:8545');
  console.log('GENESIS_VAULT=' + deployer.address);
  console.log('ARBITERS=' + arbiters.join(','));
  console.log('ATTESTORS=' + attestors.join(','));
}

main().catch(console.error);
