/**
 * Drain KYC notification outbox (email channel).
 * Invoke via cron: /api/kyc?action=outbox  (admin/cron secret)
 */
const {
  setCORS,
  jsonResponse,
  handleError,
  getSupabase,
  sendKycVerifiedEmail,
  apiError
} = require('./lib');

module.exports = async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST' && req.method !== 'GET') {
    return apiError(res, 405, 'METHOD_NOT_ALLOWED', 'GET or POST');
  }

  try {
    const cronSecret = process.env.CRON_SECRET || process.env.VERDEX_CRON_SECRET;
    const auth = req.headers.authorization || '';
    const headerSecret = req.headers['x-cron-secret'];
    const ok =
      (cronSecret && headerSecret && headerSecret === cronSecret) ||
      (cronSecret && auth === `Bearer ${cronSecret}`) ||
      process.env.VERCEL_ENV === 'development';
    if (!ok) return apiError(res, 401, 'UNAUTHORIZED', 'Cron authorization required');

    const supabase = getSupabase();
    const { data: rows, error } = await supabase
      .from('verdex_notification_outbox')
      .select('*')
      .eq('status', 'pending')
      .eq('channel', 'email')
      .lte('not_before', new Date().toISOString())
      .order('created_at', { ascending: true })
      .limit(25);
    if (error) throw error;

    let sent = 0;
    let failed = 0;
    for (const row of rows || []) {
      try {
        await supabase
          .from('verdex_notification_outbox')
          .update({
            status: 'processing',
            locked_at: new Date().toISOString(),
            lock_token: cryptoRandom()
          })
          .eq('id', row.id)
          .eq('status', 'pending');

        if (row.template_key === 'kyc-verification-confirmed-v1') {
          const { data: authData } = await supabase.auth.admin.getUserById(row.recipient_user_id);
          const email = authData && authData.user && authData.user.email;
          const result = await sendKycVerifiedEmail(email);
          if (!result.success) throw new Error(result.error || 'send_failed');
        }

        await supabase
          .from('verdex_notification_outbox')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            locked_at: null,
            lock_token: null,
            attempt_count: (row.attempt_count || 0) + 1
          })
          .eq('id', row.id);
        sent += 1;
      } catch (err) {
        failed += 1;
        const attempts = (row.attempt_count || 0) + 1;
        await supabase
          .from('verdex_notification_outbox')
          .update({
            status: attempts >= 10 ? 'dead_letter' : 'failed',
            last_error_code: String(err.message || 'error').slice(0, 120),
            attempt_count: attempts,
            locked_at: null,
            lock_token: null,
            not_before: new Date(Date.now() + Math.min(3600000, 30000 * attempts)).toISOString()
          })
          .eq('id', row.id);
      }
    }

    return jsonResponse(res, 200, { processed: (rows || []).length, sent, failed });
  } catch (err) {
    return handleError(res, err, 'kyc/outbox');
  }
};

function cryptoRandom() {
  return require('crypto').randomUUID();
}
