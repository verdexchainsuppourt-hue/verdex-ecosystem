const {
  setCORS,
  jsonResponse,
  verifyUser,
  apiError,
  getSupabase,
} = require('./lib');
const { parseBody } = require('../../lib/api-lib');

module.exports = async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return apiError(res, 405, 'METHOD_NOT_ALLOWED', 'POST only');

  try {
    const user = await verifyUser(req);
    if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');

    const body = (typeof parseBody === 'function' ? parseBody(req) : req.body) || {};
    const supabase = getSupabase();
    const now = new Date().toISOString();
    const reviewDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const caseId = req.query?.id || req.query?.case_id || body.case_id || `kyc_case_${Date.now()}`;

    // Get latest KYC case from DB to see if we can update it
    let existingCase = null;
    try {
      const { data } = await supabase
        .from('verdex_kyc_cases')
        .select('id, status')
        .eq('subject_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      existingCase = data;
    } catch (e) {
      console.error('Error fetching existing case:', e);
    }

    const caseData = {
      subject_user_id: user.id,
      status: 'submitted',
      country_code: String(body.country_code || 'PK').toUpperCase().substring(0, 2),
      verification_level: 'enhanced',
      submitted_at: now,
      expires_at: reviewDeadline,
      updated_at: now,
      metadata: {
        full_name: body.full_name || body.fullName || user.user_metadata?.full_name || 'Unspecified',
        id_type: body.id_type || body.idType || 'national_id',
        id_number: body.id_number || body.idNumber || '',
        documents: body.documents || body.uploads || [],
        submitted_by_ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1'
      }
    };

    if (existingCase) {
      const { error: updateErr } = await supabase
        .from('verdex_kyc_cases')
        .update(caseData)
        .eq('id', existingCase.id);
      if (updateErr) {
        console.error('Error updating existing case:', updateErr);
        throw updateErr;
      }
    } else {
      const { error: insertErr } = await supabase
        .from('verdex_kyc_cases')
        .insert({
          ...caseData,
          created_at: now
        });
      if (insertErr) {
        console.error('Error inserting new case:', insertErr);
        throw insertErr;
      }
    }

    // Update profile kyc_status to 'submitted'
    const { error: profileErr } = await supabase
      .from('profiles')
      .update({
        kyc_status: 'submitted',
        full_name: body.full_name || undefined,
        updated_at: now
      })
      .eq('id', user.id);
    if (profileErr) {
      console.error('Error updating profile kyc status:', profileErr);
    }

    return jsonResponse(res, 200, {
      success: true,
      case_id: caseId,
      status: 'submitted',
      kyc_status: 'submitted',
      message: 'KYC application submitted successfully! Your documents are under review.',
      estimated_review_hours: 24,
      submitted_at: now,
      review_deadline: reviewDeadline
    });
  } catch (err) {
    console.error('KYC submit error:', err);
    return jsonResponse(res, 500, {
      success: false,
      error: {
        code: 'KYC_SUBMISSION_FAILED',
        message: err.message || 'Failed to submit KYC application'
      }
    });
  }
};
