const { verifyApiToken, getSupabase, jsonResponse, handleError, setCORS } = require('../../lib/api-lib');
const crypto = require('crypto');

module.exports = async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'Method not allowed' });

  try {
    // Authenticate device token
    const tokenRecord = await verifyApiToken(req);
    if (!tokenRecord) {
      return jsonResponse(res, 401, { error: 'Invalid or expired device token' });
    }

    const userId = tokenRecord.user_id;
    const supabase = getSupabase();

    // Query user's wallet
    const { data: wallet, error: walletErr } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (walletErr || !wallet) {
      return jsonResponse(res, 400, { error: 'User wallet not initialized.' });
    }

    // Require setup wallet address
    if (!wallet.vdx_address || !wallet.wallet_set_up) {
      return jsonResponse(res, 400, {
        error: 'Wallet address not configured. Please open the Wallet tab in the app first to set up/generate your VDX address.'
      });
    }

    const currentVp = Number(wallet.vp_balance_cached || 0);
    if (currentVp < 25) {
      return jsonResponse(res, 400, {
        error: `Insufficient VP balance. Minimum 25 VP required for conversion (you have ${currentVp} VP).`
      });
    }

    // Set balances
    const conversionAmount = currentVp;
    const vdxAmount = Number((currentVp / 25.0).toFixed(6));
    const newVpBalance = 0;
    const newVdxBalance = Number(wallet.vdx_balance_cached || 0) + vdxAmount;

    // Record the negative transaction in point_transactions
    const { error: txErr } = await supabase.from('point_transactions').insert({
      user_id: userId,
      amount: -conversionAmount,
      type: 'conversion',
      description: `Converted ${conversionAmount} VP to ${vdxAmount} mainnet VDX tokens`,
      balance_after: newVpBalance
    });

    if (txErr) throw txErr;

    // Update the wallet record
    const { error: updateErr } = await supabase
      .from('wallets')
      .update({
        vp_balance_cached: newVpBalance,
        vdx_balance_cached: newVdxBalance
      })
      .eq('user_id', userId);

    if (updateErr) throw updateErr;

    // Generate mock transaction hash for explorer representation
    const txHash = '0x' + crypto.randomBytes(32).toString('hex');

    return jsonResponse(res, 200, {
      success: true,
      message: `Successfully converted ${conversionAmount} VP to ${vdxAmount} mainnet VDX!`,
      txHash: txHash,
      data: {
        txHash: txHash,
        amountVDX: vdxAmount,
        payoutAmountVDX: vdxAmount,
        payoutAmountVDXL: vdxAmount,
        vdxBalance: newVdxBalance
      }
    });
  } catch (err) {
    return handleError(res, err, 'payout');
  }
};
