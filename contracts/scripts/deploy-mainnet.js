/**
 * Irreversible Verdex mainnet deployment gate.
 *
 * This script deploys no validator keys and creates no custody wallets. It
 * accepts only an already-deployed, independently controlled Safe-compatible
 * governance multisig and a contract-backed genesis vault. It rejects the
 * legacy testnet chain and emits the exact runtime-code hashes needed by the
 * public release boundary after deployment.
 */
const { createHash } = require('crypto');
const hre = require('hardhat');

const APPROVAL = 'I_UNDERSTAND_MAINNET_DEPLOYMENT_IS_IRREVERSIBLE';
const SAFE_ABI = [
  'function getOwners() view returns (address[])',
  'function getThreshold() view returns (uint256)'
];

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function parseAddressList(name, { minimum = 1 } = {}) {
  const values = required(name).split(',').map((value) => value.trim()).filter(Boolean);
  if (values.length < minimum || values.some((value) => !hre.ethers.isAddress(value))) {
    throw new Error(`${name} must contain at least ${minimum} valid addresses.`);
  }
  const unique = new Set(values.map((value) => value.toLowerCase()));
  if (unique.size !== values.length) throw new Error(`${name} contains duplicate addresses.`);
  return values;
}

function requiredHash(name) {
  const value = required(name).toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(value)) throw new Error(`${name} must be a 32-byte hex hash.`);
  return value;
}

function runtimeCodeSha256(code) {
  const bytecode = String(code || '').replace(/^0x/, '');
  if (!/^[0-9a-f]+$/i.test(bytecode) || bytecode.length === 0 || bytecode.length % 2 !== 0) {
    throw new Error('Unable to calculate a runtime-code hash for an empty or invalid deployment.');
  }
  return createHash('sha256').update(Buffer.from(bytecode, 'hex')).digest('hex');
}

async function assertSafeMultisig(address, expectedOwners, expectedThreshold) {
  const code = await hre.ethers.provider.getCode(address);
  if (code === '0x') throw new Error('MAINNET_GOVERNANCE_MULTISIG must be a deployed Safe-compatible multisig.');

  let owners;
  let threshold;
  try {
    const safe = new hre.ethers.Contract(address, SAFE_ABI, hre.ethers.provider);
    [owners, threshold] = await Promise.all([safe.getOwners(), safe.getThreshold()]);
  } catch {
    throw new Error('MAINNET_GOVERNANCE_MULTISIG did not expose the required Safe owner/threshold interface.');
  }

  const actual = new Set(owners.map((owner) => owner.toLowerCase()));
  const expected = new Set(expectedOwners.map((owner) => owner.toLowerCase()));
  if (actual.size !== expected.size || [...expected].some((owner) => !actual.has(owner))) {
    throw new Error('The deployed Safe owner set does not exactly match MAINNET_GOVERNANCE_MULTISIG_OWNERS.');
  }
  if (threshold !== BigInt(expectedThreshold)) {
    throw new Error('The deployed Safe threshold does not match MAINNET_GOVERNANCE_MULTISIG_THRESHOLD.');
  }
}

async function main() {
  if (process.env.MAINNET_DEPLOY_APPROVED !== APPROVAL) {
    throw new Error('Refusing deployment: set MAINNET_DEPLOY_APPROVED to the documented irreversible-deployment acknowledgement.');
  }

  const expectedChainId = BigInt(required('VERDEX_MAINNET_CHAIN_ID'));
  const expectedGenesisHash = requiredHash('VERDEX_MAINNET_GENESIS_HASH');
  const protocolVersion = required('VERDEX_MAINNET_PROTOCOL_VERSION');
  const genesisVault = required('MAINNET_GENESIS_VAULT');
  const governanceMultisig = required('MAINNET_GOVERNANCE_MULTISIG');
  const governanceOwners = parseAddressList('MAINNET_GOVERNANCE_MULTISIG_OWNERS', { minimum: 3 });
  const governanceThreshold = Number(required('MAINNET_GOVERNANCE_MULTISIG_THRESHOLD'));
  const arbiters = parseAddressList('MAINNET_ARBITERS', { minimum: 3 });
  const tradeAttestors = parseAddressList('MAINNET_TRADE_ATTESTORS', { minimum: 2 });
  const quorum = Number(required('MAINNET_ARBITRATION_QUORUM'));
  const [deployer] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();

  if (network.chainId !== expectedChainId || network.chainId === 7201n) {
    throw new Error(`Refusing deployment: connected chainId ${network.chainId} does not match an approved non-testnet mainnet.`);
  }
  if (!hre.ethers.isAddress(genesisVault) || !hre.ethers.isAddress(governanceMultisig)) {
    throw new Error('Invalid genesis vault or governance multisig address.');
  }
  if (governanceThreshold < 2 || governanceThreshold > governanceOwners.length) {
    throw new Error('MAINNET_GOVERNANCE_MULTISIG_THRESHOLD must be between 2 and the reviewed owner count.');
  }
  if (quorum < 2 || quorum > arbiters.length || !Number.isSafeInteger(quorum)) {
    throw new Error('MAINNET_ARBITRATION_QUORUM must be a safe threshold between 2 and the independent arbiter count.');
  }
  if (deployer.address.toLowerCase() === governanceMultisig.toLowerCase() ||
      deployer.address.toLowerCase() === genesisVault.toLowerCase()) {
    throw new Error('The deployer cannot be the governance multisig or genesis custody vault.');
  }

  const genesis = await hre.ethers.provider.getBlock(0);
  if (!genesis?.hash || genesis.hash.toLowerCase() !== expectedGenesisHash) {
    throw new Error('Refusing deployment: the connected chain genesis hash does not match VERDEX_MAINNET_GENESIS_HASH.');
  }
  if (await hre.ethers.provider.getCode(genesisVault) === '0x') {
    throw new Error('MAINNET_GENESIS_VAULT must already be a contract-backed custody or audited allocation vault.');
  }
  await assertSafeMultisig(governanceMultisig, governanceOwners, governanceThreshold);

  console.log(`Deploying from ${deployer.address} on approved chain ${network.chainId}`);
  const Token = await hre.ethers.getContractFactory('VerdexMainnetVDX');
  const token = await Token.deploy(genesisVault);
  await token.waitForDeployment();

  const Escrow = await hre.ethers.getContractFactory('VerdexP2PEscrow');
  const escrow = await Escrow.deploy(await token.getAddress(), governanceMultisig, arbiters, tradeAttestors, quorum);
  await escrow.waitForDeployment();

  const [tokenAddress, escrowAddress] = await Promise.all([token.getAddress(), escrow.getAddress()]);
  const [tokenCode, escrowCode] = await Promise.all([
    hre.ethers.provider.getCode(tokenAddress),
    hre.ethers.provider.getCode(escrowAddress)
  ]);

  console.log(JSON.stringify({
    chainId: network.chainId.toString(),
    genesisHash: expectedGenesisHash,
    protocolVersion,
    assetModel: 'prc20',
    vdx: tokenAddress,
    p2pEscrow: escrowAddress,
    contractRuntimeCodeSha256: {
      vdx: runtimeCodeSha256(tokenCode),
      p2pEscrow: runtimeCodeSha256(escrowCode)
    },
    vdxMaximumSupply: '1000000000',
    genesisVault,
    governanceMultisig,
    governanceOwners,
    governanceThreshold,
    arbiters,
    tradeAttestors,
    arbitrationQuorum: quorum
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
