// /api/auth?action=send-welcome — Admin sends a welcome email to any user
const { sendWelcomeEmail, jsonResponse, handleError, setCORS } = require('../../lib/api-lib');

module.exports = async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'Method not allowed' });

  try {
    const { email } = req.body;
    if (!email) return jsonResponse(res, 400, { error: 'Email is required' });

    const result = await sendWelcomeEmail(email);
    if (!result.success) {
      return jsonResponse(res, 500, { error: 'Failed to send welcome email: ' + result.error });
    }

    return jsonResponse(res, 200, { success: true, message: 'Welcome email sent to ' + email });
  } catch (err) {
    return handleError(res, err, 'auth/send-welcome');
  }
};
