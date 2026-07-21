#!/usr/bin/env node
'use strict';

/**
 * Mainnet release-evidence verifier.
 *
 * This program deliberately does not create wallets, validator keys, Safe
 * owners, signatures, deployments, or audit/legal approvals.  It validates
 * public, independently supplied evidence and fails closed when any required
 * fact cannot be proved from the configured trust roots and RPC endpoints.
 *
 * Usage:
 *   VERDEX_TRUSTED_GENESIS_ED25519_PUBLIC_KEY=<base64-spki> \
 *   VERDEX_TRUSTED_AUDITOR_ED25519_PUBLIC_KEY=<base64-spki> \
 *   VERDEX_TRUSTED_COMPLIANCE_ED25519_PUBLIC_KEY=<base64-spki> \
 *   node contracts/scripts/verify-mainnet-evidence.js mainnet/MAINNET_RELEASE_EVIDENCE.json \
 *     --trusted-validators mainnet/TRUSTED_VALIDATOR_KEYS.json
 *
 * The trusted keys are public Ed25519 SubjectPublicKeyInfo DER values.  They
 * must be established out-of-band (board resolution / vendor onboarding), not
 * copied from the release manifest being verified.
 */

const { createHash, createPublicKey, verify } = require('crypto');
const { readFileSync } = require('fs');

const EIP1967_IMPLEMENTATION_SLOT =
  '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const SAFE_GET_OWNERS = '0xa0e67e2b';
const SAFE_GET_THRESHOLD = '0xe75235b8';
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
const MAX_RPC_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_BLOCK_AGE_SECONDS = 20 * 60;
const DEFAULT_MAX_HEAD_DELTA = 5;
// Verdex's generated production target is Besu QBFT. Four validators are the
// minimum for Byzantine fault tolerance; this is stricter than a basic
// three-operator availability check.
const MIN_VALIDATORS = 4;

function fail(message) {
  const error = new Error(message);
  error.code = 'MAINNET_EVIDENCE_INVALID';
  throw error;
}

function canonicalJson(value) {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) fail('Evidence contains a non-safe numeric value.');
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    fail('Evidence must contain only plain JSON objects.');
  }
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function isPlaceholder(value) {
  return typeof value !== 'string' || !value.trim() || /^(REPLACE|TODO|TBD|EXAMPLE|YOUR_|<)/i.test(value.trim());
}

function requiredString(value, name, { max = 4096 } = {}) {
  if (isPlaceholder(value) || value.length > max) fail(`${name} is missing, a placeholder, or too long.`);
  return value.trim();
}

function normalizeHash(value, name) {
  const hash = requiredString(value, name).toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(hash)) fail(`${name} must be a 32-byte 0x-prefixed hash.`);
  return hash;
}

function normalizeSha256(value, name) {
  const hash = requiredString(value, name).toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{64}$/.test(hash)) fail(`${name} must be a SHA-256 hash.`);
  return hash;
}

function normalizeAddress(value, name) {
  const address = requiredString(value, name).toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(address)) fail(`${name} must be an EVM address.`);
  return address;
}

function normalizePublicHttpsUrl(value, name) {
  let url;
  try {
    url = new URL(requiredString(value, name));
  } catch {
    fail(`${name} must be an HTTPS URL.`);
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (url.protocol !== 'https:' || url.username || url.password || url.search ||
      !host.includes('.') || /^[0-9.]+$/.test(host) || host.includes(':') ||
      host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
    fail(`${name} must be a public HTTPS URL without credentials or query tokens.`);
  }
  return url.toString();
}

function parseChainId(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value === 7201) {
    fail('chain.chainId must be a unique, non-testnet safe integer.');
  }
  return value;
}

function requireIsoDate(value, name, { future = false } = {}) {
  const text = requiredString(value, name, { max: 64 });
  const time = Date.parse(text);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== text) {
    fail(`${name} must be an ISO-8601 UTC timestamp.`);
  }
  if (future && time <= Date.now()) fail(`${name} must be in the future.`);
  return text;
}

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

function normalizeBase64(value, name) {
  const text = requiredString(value, name, { max: 16384 });
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(text) || text.length % 4 !== 0) fail(`${name} must be base64.`);
  const bytes = Buffer.from(text, 'base64');
  if (!bytes.length) fail(`${name} is empty.`);
  return { text, bytes };
}

function publicKeyFromBase64(value, name) {
  const { text, bytes } = normalizeBase64(value, name);
  let key;
  try {
    key = createPublicKey({ key: bytes, format: 'der', type: 'spki' });
  } catch {
    fail(`${name} is not a valid SPKI public key.`);
  }
  if (key.asymmetricKeyType !== 'ed25519') fail(`${name} must be an Ed25519 public key.`);
  return { text, bytes, key };
}

function verifyAttestation(attestation, signedPayload, trustedPublicKeyBase64, name) {
  if (!attestation || typeof attestation !== 'object' || Array.isArray(attestation)) {
    fail(`${name}.attestation is required.`);
  }
  if (attestation.algorithm !== 'ed25519') fail(`${name}.attestation.algorithm must be ed25519.`);
  const declaredKey = requiredString(attestation.publicKeySpkiBase64, `${name}.attestation.publicKeySpkiBase64`);
  if (declaredKey !== trustedPublicKeyBase64) {
    fail(`${name} was not signed by the independently configured trust root.`);
  }
  const { key } = publicKeyFromBase64(trustedPublicKeyBase64, `${name} trust root`);
  const { bytes: signature } = normalizeBase64(attestation.signatureBase64, `${name}.attestation.signatureBase64`);
  if (!verify(null, Buffer.from(canonicalJson(signedPayload), 'utf8'), key, signature)) {
    fail(`${name} has an invalid Ed25519 signature.`);
  }
}

function decodeRpcQuantity(value, name) {
  if (typeof value !== 'string' || !/^0x[0-9a-f]+$/i.test(value)) fail(`${name} is not a JSON-RPC quantity.`);
  let parsed;
  try { parsed = BigInt(value); } catch { fail(`${name} is not a JSON-RPC quantity.`); }
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) fail(`${name} exceeds safe integer range.`);
  return Number(parsed);
}

function decodeSafeOwners(value) {
  const hex = String(value || '').replace(/^0x/, '');
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length < 128 || hex.length % 64 !== 0) {
    fail('Safe getOwners() returned malformed ABI data.');
  }
  const offset = Number(BigInt(`0x${hex.slice(0, 64)}`));
  if (offset !== 32 || offset * 2 + 64 > hex.length) fail('Safe getOwners() returned an unsupported ABI offset.');
  const length = Number(BigInt(`0x${hex.slice(offset * 2, offset * 2 + 64)}`));
  if (!Number.isSafeInteger(length) || length < 3 || length > 100 || offset * 2 + 64 + length * 64 !== hex.length) {
    fail('Safe getOwners() returned an invalid owner count.');
  }
  const owners = [];
  for (let index = 0; index < length; index += 1) {
    owners.push(`0x${hex.slice(offset * 2 + 64 + index * 64 + 24, offset * 2 + 64 + (index + 1) * 64)}`.toLowerCase());
  }
  if (new Set(owners).size !== owners.length) fail('Safe getOwners() returned duplicate owners.');
  return owners;
}

function decodeUint256(value, name) {
  const hex = String(value || '').replace(/^0x/, '');
  if (!/^[0-9a-f]{64}$/i.test(hex)) fail(`${name} returned malformed ABI data.`);
  const parsed = BigInt(`0x${hex}`);
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) fail(`${name} exceeds safe integer range.`);
  return Number(parsed);
}

function codeSha256(value, name) {
  if (typeof value !== 'string' || !/^0x[0-9a-f]+$/i.test(value) || value.length <= 2 || value.length % 2 !== 0) {
    fail(`${name} did not return deployed runtime bytecode.`);
  }
  return sha256(Buffer.from(value.slice(2), 'hex'));
}

async function fetchBytes(url, label, maxBytes = MAX_DOCUMENT_BYTES) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, { redirect: 'error', signal: controller.signal });
    if (!response.ok) fail(`${label} returned HTTP ${response.status}.`);
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength && (!Number.isSafeInteger(contentLength) || contentLength > maxBytes)) {
      fail(`${label} is larger than the permitted ${maxBytes} bytes.`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maxBytes) fail(`${label} is larger than the permitted ${maxBytes} bytes.`);
    return bytes;
  } catch (error) {
    if (error?.code === 'MAINNET_EVIDENCE_INVALID') throw error;
    fail(`${label} could not be fetched securely.`);
  } finally {
    clearTimeout(timeout);
  }
}

async function rpcCall(endpoint, method, params) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      redirect: 'error',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
    });
    if (!response.ok) fail(`RPC ${endpoint} returned HTTP ${response.status}.`);
    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength && (!Number.isSafeInteger(declaredLength) || declaredLength > MAX_RPC_BYTES)) {
      fail(`RPC ${endpoint} returned an oversized response.`);
    }
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_RPC_BYTES) fail(`RPC ${endpoint} returned an oversized response.`);
    const payload = JSON.parse(text);
    if (payload?.jsonrpc !== '2.0' || payload?.error || payload?.result === undefined || payload.result === null) {
      fail(`RPC ${endpoint} rejected ${method}.`);
    }
    return payload.result;
  } catch (error) {
    if (error?.code === 'MAINNET_EVIDENCE_INVALID') throw error;
    fail(`RPC ${endpoint} could not complete ${method}.`);
  } finally {
    clearTimeout(timeout);
  }
}

function readJson(path, label) {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail(`${label} must be a JSON object.`);
    return parsed;
  } catch (error) {
    if (error?.code === 'MAINNET_EVIDENCE_INVALID') throw error;
    fail(`Could not read ${label}: ${error.message}`);
  }
}

function parseArgs(argv) {
  const args = { manifest: null, trustedValidatorsPath: null, maxBlockAgeSeconds: DEFAULT_MAX_BLOCK_AGE_SECONDS, maxHeadDelta: DEFAULT_MAX_HEAD_DELTA };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!args.manifest && !value.startsWith('--')) { args.manifest = value; continue; }
    if (value === '--trusted-validators') { args.trustedValidatorsPath = argv[++index]; continue; }
    if (value === '--max-block-age-seconds') { args.maxBlockAgeSeconds = Number(argv[++index]); continue; }
    if (value === '--max-head-delta') { args.maxHeadDelta = Number(argv[++index]); continue; }
    fail(`Unknown or incomplete option: ${value}`);
  }
  if (!args.manifest || !args.trustedValidatorsPath) {
    fail('Usage: verify-mainnet-evidence.js <manifest.json> --trusted-validators <trusted-validator-keys.json>');
  }
  if (!Number.isSafeInteger(args.maxBlockAgeSeconds) || args.maxBlockAgeSeconds < 60 || args.maxBlockAgeSeconds > 86400) {
    fail('--max-block-age-seconds must be between 60 and 86400.');
  }
  if (!Number.isSafeInteger(args.maxHeadDelta) || args.maxHeadDelta < 0 || args.maxHeadDelta > 1000) {
    fail('--max-head-delta must be between 0 and 1000.');
  }
  return args;
}

function requiredTrustRoot(name) {
  const value = process.env[name];
  publicKeyFromBase64(value, name);
  return value;
}

function validateManifest(manifest, trustedValidatorKeys) {
  if (manifest.schemaVersion !== 1) fail('schemaVersion must be exactly 1.');
  if (!manifest.release || typeof manifest.release !== 'object') fail('release is required.');
  const release = {
    releaseId: requiredString(manifest.release.releaseId, 'release.releaseId', { max: 128 }),
    protocolVersion: requiredString(manifest.release.protocolVersion, 'release.protocolVersion', { max: 128 }),
    sourceCommit: requiredString(manifest.release.sourceCommit, 'release.sourceCommit', { max: 128 }),
    createdAt: requireIsoDate(manifest.release.createdAt, 'release.createdAt')
  };

  if (!manifest.chain || typeof manifest.chain !== 'object') fail('chain is required.');
  const rpcEndpoints = (manifest.chain.rpcEndpoints || []).map((url, index) =>
    normalizePublicHttpsUrl(url, `chain.rpcEndpoints[${index}]`));
  const rpcHosts = new Set(rpcEndpoints.map((url) => new URL(url).hostname.toLowerCase()));
  if (rpcEndpoints.length < MIN_VALIDATORS || new Set(rpcEndpoints).size !== rpcEndpoints.length || rpcHosts.size < MIN_VALIDATORS) {
    fail(`chain.rpcEndpoints must contain at least ${MIN_VALIDATORS} distinct public HTTPS hosts.`);
  }
  const chain = {
    chainId: parseChainId(manifest.chain.chainId),
    genesisHash: normalizeHash(manifest.chain.genesisHash, 'chain.genesisHash'),
    rpcEndpoints,
    signedGenesis: manifest.chain.signedGenesis
  };
  if (!chain.signedGenesis || typeof chain.signedGenesis !== 'object') fail('chain.signedGenesis is required.');
  chain.signedGenesis = {
    artifactUrl: normalizePublicHttpsUrl(chain.signedGenesis.artifactUrl, 'chain.signedGenesis.artifactUrl'),
    artifactSha256: normalizeSha256(chain.signedGenesis.artifactSha256, 'chain.signedGenesis.artifactSha256'),
    authority: requiredString(chain.signedGenesis.authority, 'chain.signedGenesis.authority', { max: 256 }),
    signedAt: requireIsoDate(chain.signedGenesis.signedAt, 'chain.signedGenesis.signedAt'),
    attestation: chain.signedGenesis.attestation
  };

  const validators = Array.isArray(manifest.validators) ? manifest.validators.map((entry, index) => {
    if (!entry || typeof entry !== 'object') fail(`validators[${index}] must be an object.`);
    const operatorId = requiredString(entry.operatorId, `validators[${index}].operatorId`, { max: 64 });
    if (!/^[a-z0-9][a-z0-9_-]{2,63}$/i.test(operatorId)) fail(`validators[${index}].operatorId is invalid.`);
    const rpcEndpoint = normalizePublicHttpsUrl(entry.rpcEndpoint, `validators[${index}].rpcEndpoint`);
    if (!rpcEndpoints.includes(rpcEndpoint)) fail(`validators[${index}].rpcEndpoint must be one of chain.rpcEndpoints.`);
    return {
      operatorId,
      validatorAddress: normalizeAddress(entry.validatorAddress, `validators[${index}].validatorAddress`),
      rpcEndpoint,
      signedAt: requireIsoDate(entry.signedAt, `validators[${index}].signedAt`),
      attestation: entry.attestation
    };
  }) : fail('validators must be an array.');
  if (validators.length < MIN_VALIDATORS || new Set(validators.map((entry) => entry.operatorId)).size !== validators.length ||
      new Set(validators.map((entry) => entry.validatorAddress)).size !== validators.length ||
      new Set(validators.map((entry) => entry.rpcEndpoint)).size !== validators.length) {
    fail(`At least ${MIN_VALIDATORS} distinct validator operators, addresses, and RPC endpoints are required.`);
  }
  const validatorIds = new Set(Object.keys(trustedValidatorKeys));
  if (validatorIds.size !== validators.length || validators.some((entry) => !validatorIds.has(entry.operatorId))) {
    fail('Trusted validator public keys must exactly match the evidence validator operators.');
  }
  for (const [operatorId, key] of Object.entries(trustedValidatorKeys)) {
    publicKeyFromBase64(key, `trusted validator key ${operatorId}`);
  }

  if (!manifest.governance || typeof manifest.governance !== 'object') fail('governance is required.');
  const owners = Array.isArray(manifest.governance.owners) ? manifest.governance.owners.map((owner, index) =>
    normalizeAddress(owner, `governance.owners[${index}]`)) : fail('governance.owners must be an array.');
  const threshold = manifest.governance.threshold;
  if (owners.length < 3 || new Set(owners).size !== owners.length || !Number.isSafeInteger(threshold) || threshold < 2 || threshold > owners.length) {
    fail('governance must contain at least three distinct owners and a threshold from 2 to owner count.');
  }
  const governance = { safeAddress: normalizeAddress(manifest.governance.safeAddress, 'governance.safeAddress'), owners, threshold };

  if (!manifest.contracts || typeof manifest.contracts !== 'object') fail('contracts is required.');
  if (manifest.contracts.assetModel !== 'prc20') fail('contracts.assetModel must be prc20 for this VDX release.');
  const vdx = manifest.contracts.vdx;
  const p2pEscrow = manifest.contracts.p2pEscrow;
  if (!vdx || !p2pEscrow) fail('contracts.vdx and contracts.p2pEscrow are required.');
  const contracts = {
    assetModel: 'prc20',
    vdx: {
      address: normalizeAddress(vdx.address, 'contracts.vdx.address'),
      runtimeCodeSha256: normalizeSha256(vdx.runtimeCodeSha256, 'contracts.vdx.runtimeCodeSha256'),
      symbol: requiredString(vdx.symbol, 'contracts.vdx.symbol', { max: 32 }),
      decimals: vdx.decimals
    },
    p2pEscrow: {
      address: normalizeAddress(p2pEscrow.address, 'contracts.p2pEscrow.address'),
      runtimeCodeSha256: normalizeSha256(p2pEscrow.runtimeCodeSha256, 'contracts.p2pEscrow.runtimeCodeSha256')
    }
  };
  if (contracts.vdx.symbol !== 'VDX' || !Number.isSafeInteger(contracts.vdx.decimals) || contracts.vdx.decimals !== 18) {
    fail('VDX contract metadata must be VDX with 18 decimals.');
  }

  if (!manifest.audit || typeof manifest.audit !== 'object') fail('audit is required.');
  const auditScope = manifest.audit.scope;
  if (!auditScope || typeof auditScope !== 'object' || Array.isArray(auditScope)) fail('audit.scope is required.');
  const normalizedAuditScope = {
    vdxRuntimeCodeSha256: normalizeSha256(auditScope.vdxRuntimeCodeSha256, 'audit.scope.vdxRuntimeCodeSha256'),
    p2pEscrowRuntimeCodeSha256: normalizeSha256(auditScope.p2pEscrowRuntimeCodeSha256, 'audit.scope.p2pEscrowRuntimeCodeSha256'),
    nodeClientRelease: requiredString(auditScope.nodeClientRelease, 'audit.scope.nodeClientRelease', { max: 256 }),
    nodeClientSourceCommit: requiredString(auditScope.nodeClientSourceCommit, 'audit.scope.nodeClientSourceCommit', { max: 128 }),
    consensusEngine: requiredString(auditScope.consensusEngine, 'audit.scope.consensusEngine', { max: 128 })
  };
  if (normalizedAuditScope.vdxRuntimeCodeSha256 !== contracts.vdx.runtimeCodeSha256 ||
      normalizedAuditScope.p2pEscrowRuntimeCodeSha256 !== contracts.p2pEscrow.runtimeCodeSha256) {
    fail('Audit scope must pin the exact VDX and P2P escrow runtime bytecode being released.');
  }
  const audit = {
    reportUrl: normalizePublicHttpsUrl(manifest.audit.reportUrl, 'audit.reportUrl'),
    reportSha256: normalizeSha256(manifest.audit.reportSha256, 'audit.reportSha256'),
    issuedAt: requireIsoDate(manifest.audit.issuedAt, 'audit.issuedAt'),
    scope: normalizedAuditScope,
    remediation: manifest.audit.remediation
  };
  if (!audit.remediation || typeof audit.remediation !== 'object') fail('audit.remediation is required.');
  audit.remediation = {
    status: audit.remediation.status,
    reportSha256: normalizeSha256(audit.remediation.reportSha256, 'audit.remediation.reportSha256'),
    signedAt: requireIsoDate(audit.remediation.signedAt, 'audit.remediation.signedAt'),
    scope: audit.remediation.scope,
    attestation: audit.remediation.attestation
  };
  if (!audit.remediation.scope || typeof audit.remediation.scope !== 'object' || Array.isArray(audit.remediation.scope) ||
      audit.remediation.status !== 'closed' || audit.remediation.reportSha256 !== audit.reportSha256 ||
      canonicalJson(audit.remediation.scope) !== canonicalJson(audit.scope)) {
    fail('The audit remediation sign-off must close the exact audited report and scope.');
  }

  if (!manifest.legalKycApproval || typeof manifest.legalKycApproval !== 'object') fail('legalKycApproval is required.');
  const legal = {
    approvalDocumentUrl: normalizePublicHttpsUrl(manifest.legalKycApproval.approvalDocumentUrl, 'legalKycApproval.approvalDocumentUrl'),
    approvalDocumentSha256: normalizeSha256(manifest.legalKycApproval.approvalDocumentSha256, 'legalKycApproval.approvalDocumentSha256'),
    approval: manifest.legalKycApproval.approval,
    attestation: manifest.legalKycApproval.attestation
  };
  if (!legal.approval || typeof legal.approval !== 'object' || Array.isArray(legal.approval)) fail('legalKycApproval.approval is required.');
  legal.approval = {
    approvalId: requiredString(legal.approval.approvalId, 'legalKycApproval.approval.approvalId', { max: 128 }),
    approverOrganisation: requiredString(legal.approval.approverOrganisation, 'legalKycApproval.approval.approverOrganisation', { max: 256 }),
    approvedAt: requireIsoDate(legal.approval.approvedAt, 'legalKycApproval.approval.approvedAt'),
    expiresAt: requireIsoDate(legal.approval.expiresAt, 'legalKycApproval.approval.expiresAt', { future: true }),
    p2pApproved: legal.approval.p2pApproved,
    manualKycAmlApproved: legal.approval.manualKycAmlApproved,
    jurisdictions: legal.approval.jurisdictions
  };
  if (legal.approval.p2pApproved !== true || legal.approval.manualKycAmlApproved !== true ||
      !Array.isArray(legal.approval.jurisdictions) || !legal.approval.jurisdictions.length ||
      legal.approval.jurisdictions.some((value) => !/^[A-Z]{2}$/.test(String(value))) ||
      new Set(legal.approval.jurisdictions).size !== legal.approval.jurisdictions.length) {
    fail('Legal/KYC approval must explicitly approve P2P and manual KYC/AML for unique ISO-3166 alpha-2 jurisdictions.');
  }

  return { release, chain, validators, governance, contracts, audit, legal };
}

async function verifyEvidence(manifest, trust, options) {
  const evidence = validateManifest(manifest, trust.validatorKeys);
  const genesisPayload = {
    chainId: evidence.chain.chainId,
    genesisHash: evidence.chain.genesisHash,
    artifactSha256: evidence.chain.signedGenesis.artifactSha256,
    authority: evidence.chain.signedGenesis.authority,
    signedAt: evidence.chain.signedGenesis.signedAt
  };
  verifyAttestation(evidence.chain.signedGenesis.attestation, genesisPayload, trust.genesisKey, 'chain.signedGenesis');
  const genesisArtifact = await fetchBytes(evidence.chain.signedGenesis.artifactUrl, 'Signed genesis artifact');
  if (sha256(genesisArtifact) !== evidence.chain.signedGenesis.artifactSha256) fail('Signed genesis artifact SHA-256 did not match the release evidence.');

  for (const validator of evidence.validators) {
    verifyAttestation(validator.attestation, {
      chainId: evidence.chain.chainId,
      genesisHash: evidence.chain.genesisHash,
      operatorId: validator.operatorId,
      validatorAddress: validator.validatorAddress,
      rpcEndpoint: validator.rpcEndpoint,
      signedAt: validator.signedAt
    }, trust.validatorKeys[validator.operatorId], `validators.${validator.operatorId}`);
  }

  const [auditReport, legalApproval] = await Promise.all([
    fetchBytes(evidence.audit.reportUrl, 'Independent audit report'),
    fetchBytes(evidence.legal.approvalDocumentUrl, 'Legal/KYC approval document')
  ]);
  if (sha256(auditReport) !== evidence.audit.reportSha256) fail('Independent audit report SHA-256 did not match the release evidence.');
  if (sha256(legalApproval) !== evidence.legal.approvalDocumentSha256) fail('Legal/KYC approval document SHA-256 did not match the release evidence.');
  verifyAttestation(evidence.audit.remediation.attestation, {
    status: evidence.audit.remediation.status,
    reportSha256: evidence.audit.remediation.reportSha256,
    signedAt: evidence.audit.remediation.signedAt,
    scope: evidence.audit.remediation.scope
  }, trust.auditorKey, 'audit.remediation');
  verifyAttestation(evidence.legal.attestation, {
    approvalDocumentSha256: evidence.legal.approvalDocumentSha256,
    approval: evidence.legal.approval
  }, trust.complianceKey, 'legalKycApproval');

  const endpointFacts = await Promise.all(evidence.chain.rpcEndpoints.map(async (endpoint) => {
    const [chainId, genesis, head] = await Promise.all([
      rpcCall(endpoint, 'eth_chainId', []),
      rpcCall(endpoint, 'eth_getBlockByNumber', ['0x0', false]),
      rpcCall(endpoint, 'eth_getBlockByNumber', ['latest', false])
    ]);
    if (decodeRpcQuantity(chainId, `eth_chainId from ${endpoint}`) !== evidence.chain.chainId ||
        String(genesis.hash || '').toLowerCase() !== evidence.chain.genesisHash) {
      fail(`RPC ${endpoint} does not match the signed mainnet identity.`);
    }
    const number = decodeRpcQuantity(head.number, `latest block number from ${endpoint}`);
    const timestamp = decodeRpcQuantity(head.timestamp, `latest block timestamp from ${endpoint}`);
    const ageSeconds = Math.floor(Date.now() / 1000) - timestamp;
    if (ageSeconds < -60 || ageSeconds > options.maxBlockAgeSeconds) {
      fail(`RPC ${endpoint} has a stale or implausible latest block timestamp.`);
    }
    return { endpoint, number, timestamp, ageSeconds };
  }));
  const headNumbers = endpointFacts.map((entry) => entry.number);
  if (Math.max(...headNumbers) - Math.min(...headNumbers) > options.maxHeadDelta) {
    fail('Independent RPC endpoints disagree beyond the permitted head block delta.');
  }

  const referenceRpc = evidence.chain.rpcEndpoints[0];
  const [safeCode, safeOwnersRaw, safeThresholdRaw] = await Promise.all([
    rpcCall(referenceRpc, 'eth_getCode', [evidence.governance.safeAddress, 'latest']),
    rpcCall(referenceRpc, 'eth_call', [{ to: evidence.governance.safeAddress, data: SAFE_GET_OWNERS }, 'latest']),
    rpcCall(referenceRpc, 'eth_call', [{ to: evidence.governance.safeAddress, data: SAFE_GET_THRESHOLD }, 'latest'])
  ]);
  codeSha256(safeCode, 'Safe');
  const actualOwners = decodeSafeOwners(safeOwnersRaw);
  const actualThreshold = decodeUint256(safeThresholdRaw, 'Safe getThreshold()');
  if (actualThreshold !== evidence.governance.threshold || actualOwners.length !== evidence.governance.owners.length ||
      actualOwners.some((owner) => !evidence.governance.owners.includes(owner))) {
    fail('The deployed Safe owners or threshold do not match the approved release evidence.');
  }

  const contractTargets = [
    ['VDX', evidence.contracts.vdx.address, evidence.contracts.vdx.runtimeCodeSha256],
    ['P2P escrow', evidence.contracts.p2pEscrow.address, evidence.contracts.p2pEscrow.runtimeCodeSha256]
  ];
  const contractFacts = await Promise.all(contractTargets.map(async ([name, address, expectedCodeHash]) => {
    const [code, implementation] = await Promise.all([
      rpcCall(referenceRpc, 'eth_getCode', [address, 'latest']),
      rpcCall(referenceRpc, 'eth_getStorageAt', [address, EIP1967_IMPLEMENTATION_SLOT, 'latest'])
    ]);
    if (codeSha256(code, name) !== expectedCodeHash) fail(`${name} runtime code hash does not match the release evidence.`);
    if (String(implementation).toLowerCase() !== `0x${'0'.repeat(64)}`) {
      fail(`${name} is an upgradeable proxy; immutable direct deployments are required.`);
    }
    return { name, address, runtimeCodeSha256: expectedCodeHash };
  }));

  return {
    status: 'VERIFIED',
    verifiedAt: new Date().toISOString(),
    release: evidence.release,
    chain: { chainId: evidence.chain.chainId, genesisHash: evidence.chain.genesisHash, rpcHeads: endpointFacts },
    validators: evidence.validators.map(({ operatorId, validatorAddress, rpcEndpoint }) => ({ operatorId, validatorAddress, rpcEndpoint })),
    governance: evidence.governance,
    contracts: contractFacts,
    evidence: {
      signedGenesisSha256: evidence.chain.signedGenesis.artifactSha256,
      auditReportSha256: evidence.audit.reportSha256,
      legalKycApprovalSha256: evidence.legal.approvalDocumentSha256,
      trustRootFingerprints: {
        genesis: sha256(Buffer.from(trust.genesisKey, 'base64')),
        auditor: sha256(Buffer.from(trust.auditorKey, 'base64')),
        compliance: sha256(Buffer.from(trust.complianceKey, 'base64')),
        validators: Object.fromEntries(Object.entries(trust.validatorKeys).map(([id, key]) => [id, sha256(Buffer.from(key, 'base64'))]))
      }
    }
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifest = readJson(options.manifest, 'mainnet evidence manifest');
  const validatorKeys = readJson(options.trustedValidatorsPath, 'trusted validator key registry');
  const trust = {
    genesisKey: requiredTrustRoot('VERDEX_TRUSTED_GENESIS_ED25519_PUBLIC_KEY'),
    auditorKey: requiredTrustRoot('VERDEX_TRUSTED_AUDITOR_ED25519_PUBLIC_KEY'),
    complianceKey: requiredTrustRoot('VERDEX_TRUSTED_COMPLIANCE_ED25519_PUBLIC_KEY'),
    validatorKeys
  };
  const result = await verifyEvidence(manifest, trust, options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`MAINNET EVIDENCE VERIFICATION FAILED: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  canonicalJson,
  validateManifest,
  verifyEvidence,
  decodeSafeOwners,
  decodeUint256,
  normalizePublicHttpsUrl
};
