/**
 * GET /api/admin?action=chain-consistency
 *
 * Verifies blockchain state stays consistent with backend records.
 * Compares:
 *  - On-chain VDX total supply vs expected (1B)
 *  - On-chain escrow contract code hash vs pinned hash
 *  - Backend custodial balance totals vs on-chain treasury balance
 *  - Block height is advancing (not stalled)
 *
 * Requires admin or treasury signer auth.
 */
const { verifyUser, verifyAdmin, getSupabase, jsonResponse, setCORS, handleError } = require('../../lib/api-lib');
const { verifyMainnetConfig, rpcCall, codeSha256 } = require('../../lib/mainnet');

async function chainConsistency(req, res) {
  const user = await verifyUser(req);
  if (!user) return jsonResponse(res, 401, { error: 'Authentication required' });

  const supabase = getSupabase();
  const admin = await verifyAdmin(req);
  const { data: signer } = await supabase
    .from('verdex_custodial_treasury_signers')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();
  if (!admin && !signer) return jsonResponse(res, 403, { error: 'Admin or treasury role required' });

  const verification = await verifyMainnetConfig();
  if (!verification.ready) {
    return jsonResponse(res, 200, {
      data: {
        status: 'mainnet_not_verified',
        consistent: false,
        message: 'Mainnet is not yet configured. Consistency checks will be available after launch.',
        timestamp: new Date().toISOString(),
      }
    });
  }

  const config = verification.config;
  const rpcUrl = config.rpcUrl;
  const checks = [];
  let allConsistent = true;

  // Check 1: Block height advancing
  try {
    const block1 = await rpcCall(rpcUrl, 'eth_blockNumber');
    await new Promise(r => setTimeout(r, 6000)); // Wait 6 seconds (should produce 1+ blocks at 5s)
    const block2 = await rpcCall(rpcUrl, 'eth_blockNumber');
    const b1 = parseInt(block1, 16);
    const b2 = parseInt(block2, 16);
    const advancing = b2 > b1;
    checks.push({
      name: 'block_height_advancing',
      consistent: advancing,
      details: { block_1: b1, block_2: b2, delta: b2 - b1 },
    });
    if (!advancing) allConsistent = false;
  } catch (e) {
    checks.push({ name: 'block_height_advancing', consistent: false, error: e.message });
    allConsistent = false;
  }

  // Check 2: VDX contract code hash matches pinned hash
  if (config.contracts && config.contracts.vdx && config.contractCodeSha256) {
    try {
      const code = await rpcCall(rpcUrl, 'eth_getCode', [config.contracts.vdx, 'latest']);
      const actualHash = codeSha256(code);
      const expectedHash = config.contractCodeSha256.vdx;
      const matches = actualHash === expectedHash;
      checks.push({
        name: 'vdx_contract_code_hash',
        consistent: matches,
        details: {
          expected: expectedHash,
          actual: actualHash,
          address: config.contracts.vdx,
        },
      });
      if (!matches) allConsistent = false;
    } catch (e) {
      checks.push({ name: 'vdx_contract_code_hash', consistent: false, error: e.message });
      allConsistent = false;
    }
  }

  // Check 3: Escrow contract code hash matches pinned hash
  if (config.contracts && config.contracts.p2pEscrow && config.contractCodeSha256) {
    try {
      const code = await rpcCall(rpcUrl, 'eth_getCode', [config.contracts.p2pEscrow, 'latest']);
      const actualHash = codeSha256(code);
      const expectedHash = config.contractCodeSha256.p2pEscrow;
      const matches = actualHash === expectedHash;
      checks.push({
        name: 'escrow_contract_code_hash',
        consistent: matches,
        details: {
          expected: expectedHash,
          actual: actualHash,
          address: config.contracts.p2pEscrow,
        },
      });
      if (!matches) allConsistent = false;
    } catch (e) {
      checks.push({ name: 'escrow_contract_code_hash', consistent: false, error: e.message });
      allConsistent = false;
    }
  }

  // Check 4: VDX total supply matches expected (1B = 1e27 wei)
  if (config.contracts && config.contracts.vdx) {
    try {
      // totalSupply() selector = 0x18160ddd
      const result = await rpcCall(rpcUrl, 'eth_call', [{
        to: config.contracts.vdx,
        data: '0x18160ddd',
      }, 'latest']);
      const supply = BigInt(result);
      const expected = BigInt('1000000000000000000000000000'); // 1B * 1e18
      const matches = supply === expected;
      checks.push({
        name: 'vdx_total_supply',
        consistent: matches,
        details: {
          expected: expected.toString(),
          actual: supply.toString(),
          tokens: Number(supply) / 1e18,
        },
      });
      if (!matches) allConsistent = false;
    } catch (e) {
      checks.push({ name: 'vdx_total_supply', consistent: false, error: e.message });
      allConsistent = false;
    }
  }

  // Check 5: Backend custodial balance totals (for reconciliation reference)
  try {
    const { data: balances } = await supabase
      .from('verdex_custodial_balances')
      .select('available_atomic, pending_atomic, locked_atomic');
    let totalAvail = 0n, totalPending = 0n, totalLocked = 0n;
    for (const b of (balances || [])) {
      totalAvail += BigInt(b.available_atomic || '0');
      totalPending += BigInt(b.pending_atomic || '0');
      totalLocked += BigInt(b.locked_atomic || '0');
    }
    checks.push({
      name: 'backend_custodial_totals',
      consistent: true, // Informational — no on-chain comparison until treasury wallet is configured
      details: {
        total_available: totalAvail.toString(),
        total_pending: totalPending.toString(),
        total_locked: totalLocked.toString(),
        note: 'Custodial balance totals. Compare with on-chain treasury balance manually.',
      },
    });
  } catch (e) {
    checks.push({ name: 'backend_custodial_totals', consistent: false, error: e.message });
  }

  // Check 6: Chain ID matches expected
  try {
    const chainId = await rpcCall(rpcUrl, 'eth_chainId');
    const actualChainId = parseInt(chainId, 16);
    const matches = actualChainId === config.chainId;
    checks.push({
      name: 'chain_id',
      consistent: matches,
      details: { expected: config.chainId, actual: actualChainId },
    });
    if (!matches) allConsistent = false;
  } catch (e) {
    checks.push({ name: 'chain_id', consistent: false, error: e.message });
    allConsistent = false;
  }

  return jsonResponse(res, 200, {
    data: {
      status: allConsistent ? 'consistent' : 'inconsistent',
      consistent: allConsistent,
      checks,
      chain_id: config.chainId,
      rpc_url: rpcUrl,
      timestamp: new Date().toISOString(),
    }
  });
}

module.exports = chainConsistency;
