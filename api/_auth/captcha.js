const { verifyUser, getSupabase, jsonResponse, handleError, setCORS } = require('../../lib/api-lib');
const crypto = require('crypto');

const secret = 'verdex-captcha-super-secret-key-1337-vdx';

function generateChallengeToken(challengeId, answer, expiresAt) {
  try {
    const payload = JSON.stringify({ challengeId, answer, expiresAt });
    const key = crypto.scryptSync(secret, 'salt', 32);
    const iv = Buffer.alloc(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(payload, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  } catch (e) {
    return challengeId;
  }
}

function verifyChallengeToken(token) {
  try {
    const key = crypto.scryptSync(secret, 'salt', 32);
    const iv = Buffer.alloc(16);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(token, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  } catch {
    return null;
  }
}

module.exports = async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const user = await verifyUser(req);
    if (!user) return jsonResponse(res, 401, { error: 'Not authenticated' });

    const supabase = getSupabase();
    const action = req.query.action || 'status';

    if (action === 'status') {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      const { data: txs } = await supabase
        .from('point_transactions')
        .select('amount')
        .eq('user_id', user.id)
        .eq('type', 'bonus')
        .gte('created_at', today.toISOString());

      const claimedToday = (txs || []).reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
      return jsonResponse(res, 200, {
        data: {
          claimed_today: claimedToday,
          daily_cap: 25,
          cap_reached: claimedToday >= 25
        }
      });
    }

    if (action === 'challenge') {
      const num1 = Math.floor(Math.random() * 12) + 1;
      const num2 = Math.floor(Math.random() * 12) + 1;
      const answer = num1 + num2;
      const question = `What is ${num1} + ${num2}?`;
      const challengeId = crypto.randomUUID();
      const expiresAt = Date.now() + 5 * 60 * 1000; // 5 mins

      const challengeToken = generateChallengeToken(challengeId, answer, expiresAt);

      return jsonResponse(res, 200, {
        data: {
          challengeId: challengeToken,
          question: question
        }
      });
    }

    if (action === 'claim') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const { challengeId, answer } = body;

      if (!challengeId || !answer) {
        return jsonResponse(res, 400, { error: 'Missing challenge token or answer' });
      }

      const decoded = verifyChallengeToken(challengeId);
      if (!decoded) {
        return jsonResponse(res, 400, { error: 'Invalid or expired challenge token' });
      }

      if (Date.now() > decoded.expiresAt) {
        return jsonResponse(res, 400, { error: 'Challenge expired. Please request a new one.' });
      }

      if (Number(answer) !== Number(decoded.answer)) {
        return jsonResponse(res, 400, { error: 'Incorrect answer. Try again.' });
      }

      // Check daily UTC cap
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      const { data: txs } = await supabase
        .from('point_transactions')
        .select('amount')
        .eq('user_id', user.id)
        .eq('type', 'bonus')
        .gte('created_at', today.toISOString());

      const claimedToday = (txs || []).reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
      const reward = 5; // +5 VDX points per captcha

      if (claimedToday + reward > 25) {
        return jsonResponse(res, 400, { error: 'Daily VDX limit reached. Try again after midnight UTC.' });
      }

      // Query current balance to derive balance_after
      const { data: wallet } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', user.id)
        .single();

      const currentBalance = Number(wallet?.vp_balance_cached || 0);
      const newBalance = currentBalance + reward;

      // Atomic insert transaction
      await supabase.from('point_transactions').insert({
        user_id: user.id,
        amount: reward,
        type: 'bonus',
        description: 'Daily captcha reward',
        balance_after: newBalance
      });

      // Update cached wallet balance
      await supabase
        .from('wallets')
        .update({ vp_balance_cached: newBalance })
        .eq('user_id', user.id);

      return jsonResponse(res, 200, {
        data: {
          success: true,
          granted_vdx: reward,
          reward_balance_vdx: newBalance
        }
      });
    }

    return jsonResponse(res, 404, { error: `Unknown captcha action: ${action}` });
  } catch (err) {
    return handleError(res, err, 'auth/captcha');
  }
};
