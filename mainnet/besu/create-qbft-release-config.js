#!/usr/bin/env node
'use strict';

/**
 * Generates deterministic, non-secret Besu QBFT release configuration from
 * independently supplied public deployment inputs. It never creates keys,
 * signs the genesis, starts a validator, deploys a contract, or overwrites an
 * existing output directory.
 *
 * Usage:
 *   node mainnet/besu/create-qbft-release-config.js \
 *     mainnet/besu/DEPLOYMENT_INPUTS.json mainnet/besu/generated
 */

const { createHash } = require('crypto');
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('fs');
const { dirname, resolve } = require('path');

const VANITY = Buffer.alloc(32);
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const QBFT_MIX_HASH = '0x63746963616c2062797a616e74696e65206661756c7420746f6c6572616e6365';
const MIN_BFT_VALIDATORS = 4;

function fail(message) {
  const error = new Error(message);
  error.code = 'QBFT_RELEASE_INPUT_INVALID';
  throw error;
}

function isPlaceholder(value) {
  return typeof value !== 'string' || !value.trim() || /^(TO_BE_|REPLACE|TODO|TBD|<)/i.test(value.trim());
}

function requiredString(value, name) {
  if (isPlaceholder(value)) fail(`${name} must be provided during the deployment ceremony.`);
  return value.trim();
}

function address(value, name) {
  const result = requiredString(value, name).toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(result)) fail(`${name} must be an EVM public address.`);
  return result;
}

function hexQuantity(value, name) {
  const result = requiredString(value, name).toLowerCase();
  if (!/^0x[1-9a-f][0-9a-f]*$/.test(result)) fail(`${name} must be a non-zero hexadecimal quantity.`);
  return result;
}

function publicHttpsOrigin(value, name) {
  let url;
  try { url = new URL(requiredString(value, name)); } catch { fail(`${name} must be a public HTTPS origin.`); }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      !url.hostname.includes('.') || url.hostname === 'localhost' || url.hostname.endsWith('.local')) {
    fail(`${name} must be a public HTTPS origin with no path, credentials, query, or fragment.`);
  }
  return url.origin;
}

function enode(value, name) {
  const result = requiredString(value, name);
  if (!/^enode:\/\/[0-9a-f]{128}@[a-z0-9.-]+:[1-9][0-9]{0,4}(?:\?discport=[1-9][0-9]{0,4})?$/i.test(result)) {
    fail(`${name} must be a public enode URL with a 512-bit node identity and port.`);
  }
  return result;
}

function encodeLength(length, offset) {
  if (length < 56) return Buffer.from([offset + length]);
  const hex = length.toString(16).padStart(length.toString(16).length + length.toString(16).length % 2, '0');
  const bytes = Buffer.from(hex, 'hex');
  return Buffer.concat([Buffer.from([offset + 55 + bytes.length]), bytes]);
}

function rlp(value) {
  if (Array.isArray(value)) {
    const body = Buffer.concat(value.map(rlp));
    return Buffer.concat([encodeLength(body.length, 0xc0), body]);
  }
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  if (bytes.length === 1 && bytes[0] < 0x80) return bytes;
  return Buffer.concat([encodeLength(bytes.length, 0x80), bytes]);
}

function qbftExtraData(validators) {
  // QBFT header selection: RLP([32 byte vanity, validators, no vote,
  // round = 0, no seals]). Addresses must be lexicographically ascending.
  const validatorBytes = validators.map((item) => Buffer.from(item.slice(2), 'hex'));
  return `0x${rlp([VANITY, validatorBytes, [], Buffer.alloc(0), []]).toString('hex')}`;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function stableJson(value) {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function readInputs(path) {
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Deployment inputs must be a JSON object.');
    return value;
  } catch (error) {
    if (error?.code === 'QBFT_RELEASE_INPUT_INVALID') throw error;
    fail(`Unable to read deployment inputs: ${error.message}`);
  }
}

function validateInputs(input) {
  if (input.schemaVersion !== 1 || input.status !== 'READY_FOR_DEPLOYMENT_REVIEW') {
    fail('schemaVersion must be 1 and status must be READY_FOR_DEPLOYMENT_REVIEW.');
  }
  const chainId = input.chainId;
  if (!Number.isSafeInteger(chainId) || chainId < 1 || chainId === 7201) fail('chainId must be a reviewed unique non-testnet integer.');
  const timestamp = input.genesisTimestampUnixSeconds;
  if (!Number.isSafeInteger(timestamp) || timestamp < Math.floor(Date.now() / 1000) + 300) {
    fail('genesisTimestampUnixSeconds must be at least five minutes in the future when generated.');
  }
  if (input.networkName !== 'Verdex Mainnet') fail('networkName must be exactly Verdex Mainnet.');
  const distribution = input.besuDistribution || {};
  const besuVersion = requiredString(distribution.version, 'besuDistribution.version');
  if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:[-.][a-z0-9]+)*$/i.test(besuVersion)) {
    fail('besuDistribution.version must be an exact Besu release version.');
  }
  const besuSourceUrl = requiredString(distribution.sourceUrl, 'besuDistribution.sourceUrl');
  let parsedBesuSource;
  try { parsedBesuSource = new URL(besuSourceUrl); } catch { fail('besuDistribution.sourceUrl must be a valid URL.'); }
  if (parsedBesuSource.protocol !== 'https:' || parsedBesuSource.hostname !== 'github.com' ||
      parsedBesuSource.pathname !== `/besu-eth/besu/releases/download/${besuVersion}/besu-${besuVersion}.zip`) {
    fail('besuDistribution.sourceUrl must reference the exact official besu-eth/besu GitHub release ZIP.');
  }
  const besuSha256 = requiredString(distribution.sha256, 'besuDistribution.sha256').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(besuSha256)) fail('besuDistribution.sha256 must be a 64-character SHA-256.');
  const qbft = input.qbft || {};
  const blockPeriodSeconds = qbft.blockPeriodSeconds;
  const requestTimeoutSeconds = qbft.requestTimeoutSeconds;
  const epochLength = qbft.epochLength;
  if (!Number.isSafeInteger(blockPeriodSeconds) || blockPeriodSeconds < 2 || blockPeriodSeconds > 60 ||
      !Number.isSafeInteger(requestTimeoutSeconds) || requestTimeoutSeconds < blockPeriodSeconds * 2 || requestTimeoutSeconds > 300 ||
      !Number.isSafeInteger(epochLength) || epochLength < 1000 || epochLength > 1000000) {
    fail('QBFT timing values are outside the reviewed production ranges.');
  }
  const validators = Array.isArray(input.validatorAddresses) ? input.validatorAddresses.map((item, index) => address(item, `validatorAddresses[${index}]`)) : [];
  if (validators.length < MIN_BFT_VALIDATORS || new Set(validators).size !== validators.length) {
    fail(`At least ${MIN_BFT_VALIDATORS} distinct validator public addresses are required for QBFT BFT.`);
  }
  const sortedValidators = [...validators].sort();
  const bootnodes = Array.isArray(input.bootnodes) ? input.bootnodes.map((item, index) => enode(item, `bootnodes[${index}]`)) : [];
  if (bootnodes.length < MIN_BFT_VALIDATORS || new Set(bootnodes).size !== bootnodes.length) {
    fail(`At least ${MIN_BFT_VALIDATORS} distinct public bootnodes are required.`);
  }
  const allocations = Array.isArray(input.nativeGasAllocations) ? input.nativeGasAllocations.map((item, index) => ({
    address: address(item?.address, `nativeGasAllocations[${index}].address`),
    balanceHex: hexQuantity(item?.balanceHex, `nativeGasAllocations[${index}].balanceHex`)
  })) : [];
  if (allocations.length < 2 || new Set(allocations.map((item) => item.address)).size !== allocations.length) {
    fail('At least two distinct native gas allocations (treasury and deployer) are required.');
  }
  const rpc = input.publicRpc || {};
  const hostAllowlist = Array.isArray(rpc.hostAllowlist) ? rpc.hostAllowlist.map((item, index) => {
    const host = requiredString(item, `publicRpc.hostAllowlist[${index}]`).toLowerCase();
    if (!/^(?:[a-z0-9-]+\.)+[a-z]{2,63}$/.test(host)) fail(`publicRpc.hostAllowlist[${index}] must be a public DNS hostname.`);
    return host;
  }) : [];
  const corsOrigins = Array.isArray(rpc.corsOrigins) ? rpc.corsOrigins.map((item, index) => publicHttpsOrigin(item, `publicRpc.corsOrigins[${index}]`)) : [];
  if (!hostAllowlist.length || !corsOrigins.includes('https://verdexswap.site')) fail('Public RPC must allow verdexswap.site and declare a hostname allowlist.');

  return {
    networkName: requiredString(input.networkName, 'networkName'),
    chainId,
    timestamp,
    besuDistribution: { version: besuVersion, sourceUrl: besuSourceUrl, sha256: besuSha256 },
    qbft: {
      blockPeriodSeconds,
      requestTimeoutSeconds,
      epochLength,
      gasLimit: hexQuantity(qbft.gasLimit, 'qbft.gasLimit'),
      minimumGasPriceWei: (() => {
        const value = requiredString(qbft.minimumGasPriceWei, 'qbft.minimumGasPriceWei');
        if (!/^[1-9][0-9]*$/.test(value)) fail('qbft.minimumGasPriceWei must be a non-zero decimal amount.');
        return value;
      })()
    },
    validators: sortedValidators,
    bootnodes,
    allocations,
    hostAllowlist,
    corsOrigins,
    rateLimitOwner: requiredString(rpc.rateLimitOwner, 'publicRpc.rateLimitOwner')
  };
}

function outputFiles(config) {
  const alloc = Object.fromEntries(config.allocations.map(({ address: recipient, balanceHex }) => [recipient.slice(2), { balance: balanceHex }]));
  const genesis = {
    config: {
      chainId: config.chainId,
      berlinBlock: 0,
      qbft: {
        epochlength: config.qbft.epochLength,
        blockperiodseconds: config.qbft.blockPeriodSeconds,
        requesttimeoutseconds: config.qbft.requestTimeoutSeconds,
        emptyblockperiodseconds: config.qbft.blockPeriodSeconds,
        blockreward: '0'
      }
    },
    nonce: '0x0',
    timestamp: `0x${config.timestamp.toString(16)}`,
    extraData: qbftExtraData(config.validators),
    gasLimit: config.qbft.gasLimit,
    difficulty: '0x1',
    mixHash: QBFT_MIX_HASH,
    coinbase: ZERO_ADDRESS,
    alloc,
    number: '0x0',
    gasUsed: '0x0',
    parentHash: `0x${'0'.repeat(64)}`
  };
  const validatorToml = [
    '# Generated release configuration. Validator private key/HSM configuration is supplied outside this file.',
    'data-path="/var/lib/verdex-validator"',
    'genesis-file="/etc/verdex/genesis.json"',
    'p2p-host="0.0.0.0"',
    'p2p-port=30303',
    'discovery-enabled=false',
    `bootnodes=[${config.bootnodes.map((item) => JSON.stringify(item)).join(',')}]`,
    'static-nodes-file="/var/lib/verdex-validator/static-nodes.json"',
    'permissions-nodes-config-file="/var/lib/verdex-validator/permissions_config.toml"',
    'permissions-nodes-config-file-enabled=true',
    'rpc-http-enabled=false',
    'rpc-ws-enabled=false',
    'graphql-http-enabled=false',
    'metrics-enabled=true',
    'metrics-host="127.0.0.1"',
    'metrics-port=9545',
    `min-gas-price=${config.qbft.minimumGasPriceWei}`
  ].join('\n') + '\n';
  const rpcToml = [
    '# Generated read-only RPC configuration. Expose only through a TLS-authenticated edge proxy.',
    'data-path="/var/lib/verdex-rpc"',
    'genesis-file="/etc/verdex/genesis.json"',
    'p2p-host="0.0.0.0"',
    'p2p-port=30303',
    'discovery-enabled=false',
    `bootnodes=[${config.bootnodes.map((item) => JSON.stringify(item)).join(',')}]`,
    'static-nodes-file="/var/lib/verdex-rpc/static-nodes.json"',
    'permissions-nodes-config-file="/var/lib/verdex-rpc/permissions_config.toml"',
    'permissions-nodes-config-file-enabled=true',
    'rpc-http-enabled=true',
    'rpc-http-host="127.0.0.1"',
    'rpc-http-port=8545',
    'rpc-http-api=["ETH","NET","WEB3","TXPOOL","ADMIN"]',
    `host-allowlist=[${[...new Set([...config.hostAllowlist, 'localhost', '127.0.0.1'])].map((item) => JSON.stringify(item)).join(',')}]`,
    `rpc-http-cors-origins=[${config.corsOrigins.map((item) => JSON.stringify(item)).join(',')}]`,
    'rpc-ws-enabled=true',
    'rpc-ws-host="127.0.0.1"',
    'rpc-ws-port=8546',
    'rpc-ws-api=["ETH","NET","WEB3"]',
    'graphql-http-enabled=false',
    'metrics-enabled=true',
    'metrics-host="127.0.0.1"',
    'metrics-port=9545',
    `min-gas-price=${config.qbft.minimumGasPriceWei}`
  ].join('\n') + '\n';
  const staticNodes = `${JSON.stringify(config.bootnodes, null, 2)}\n`;
  const permissionsConfig = [
    '# Generated node allowlist. Account allowlisting remains disabled until a signed governance decision.',
    `nodes-allowlist=[${config.bootnodes.map((item) => JSON.stringify(item)).join(',')}]`,
    ''
  ].join('\n');
  const manifest = {
    status: 'GENERATED_NOT_SIGNED_NOT_DEPLOYED',
    networkName: config.networkName,
    chainId: config.chainId,
    genesisTimestampUnixSeconds: config.timestamp,
    genesisConfigurationSha256: sha256(stableJson(genesis)),
    besuDistribution: config.besuDistribution,
    validators: config.validators,
    bootnodes: config.bootnodes,
    nativeGasAllocations: config.allocations,
    publicRpc: { hostAllowlist: config.hostAllowlist, corsOrigins: config.corsOrigins, rateLimitOwner: config.rateLimitOwner },
    requiredNextSteps: [
      'Each validator operator configures an independently controlled HSM or remote signer outside this repository.',
      'Operators independently validate this exact genesis configuration and start an isolated staging rehearsal.',
      'The release board obtains and signs the final genesis hash from block zero after the agreed ceremony.',
      'Only after audited contracts, Safe ownership, evidence verification, and legal/KYC approval may deployment be considered.'
    ]
  };
  return {
    'genesis.json': `${JSON.stringify(genesis, null, 2)}\n`,
    'toEncode.json': `${JSON.stringify(config.validators, null, 2)}\n`,
    'nodes-allowlist.json': `${JSON.stringify(config.bootnodes, null, 2)}\n`,
    'static-nodes.json': staticNodes,
    'permissions_config.toml': permissionsConfig,
    'validator.toml': validatorToml,
    'rpc.toml': rpcToml,
    'release-config-manifest.json': `${JSON.stringify(manifest, null, 2)}\n`
  };
}

function main() {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath || !outputPath || process.argv.length !== 4) {
    fail('Usage: create-qbft-release-config.js <DEPLOYMENT_INPUTS.json> <empty-output-directory>');
  }
  const outputDirectory = resolve(outputPath);
  if (existsSync(outputDirectory)) fail('Refusing to overwrite an existing output directory. Choose a new release directory.');
  const config = validateInputs(readInputs(inputPath));
  const files = outputFiles(config);
  mkdirSync(outputDirectory, { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    const path = resolve(outputDirectory, name);
    if (dirname(path) !== outputDirectory) fail('Generated file escaped the requested output directory.');
    writeFileSync(path, body, { encoding: 'utf8', flag: 'wx' });
  }
  process.stdout.write(`${JSON.stringify({ status: 'GENERATED_NOT_SIGNED_NOT_DEPLOYED', outputDirectory, files: Object.keys(files) }, null, 2)}\n`);
}

if (require.main === module) {
  try { main(); } catch (error) {
    process.stderr.write(`QBFT RELEASE CONFIGURATION FAILED: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { qbftExtraData, rlp, validateInputs, outputFiles };
