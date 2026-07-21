const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
  const i = line.indexOf('=');
  const k = line.slice(0, i).trim();
  let v = line.slice(i + 1).trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  if (!process.env[k]) process.env[k] = v;
}

const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

(async () => {
  const { data, error } = await s
    .from('verdex_p2p_platform_policy')
    .update({
      p2p_enabled: true,
      listing_access_mode: 'explicit_allowlist',
      require_kyc: true,
      require_aml_clear: true,
      version: 2
    })
    .eq('singleton', true)
    .select('*')
    .single();
  if (error) {
    console.error('ERR', error.message);
    process.exit(1);
  }
  console.log('OK p2p_enabled=', data.p2p_enabled, 'mode=', data.listing_access_mode);
})();
