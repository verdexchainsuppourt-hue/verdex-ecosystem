/**
 * Verdex Supabase auto-setup
 * - Creates private KYC / dispute storage buckets
 * - Applies SQL migrations (via SUPABASE_DB_URL or SUPABASE_ACCESS_TOKEN)
 * - Seeds platform policy row if missing
 *
 * Usage:
 *   node scripts/supabase-auto-setup.js
 *
 * Env (.env or process):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SUPABASE_DB_URL or DATABASE_URL          (postgres connection — preferred for DDL)
 *   SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF  (Management API fallback)
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function loadEnvFile() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnvFile();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB_URL =
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.DIRECT_URL;
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PROJECT_REF =
  process.env.SUPABASE_PROJECT_REF ||
  (SUPABASE_URL ? new URL(SUPABASE_URL).hostname.split('.')[0] : null);

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const BUCKETS = [
  {
    id: 'verdex-kyc-private',
    name: 'verdex-kyc-private',
    public: false,
    fileSizeLimit: 25 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'video/mp4']
  },
  {
    id: 'verdex-p2p-dispute-private',
    name: 'verdex-p2p-dispute-private',
    public: false,
    fileSizeLimit: 25 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  }
];

async function ensureBuckets() {
  console.log('→ Storage buckets');
  const { data: existing, error } = await admin.storage.listBuckets();
  if (error) throw error;
  const names = new Set((existing || []).map((b) => b.name));
  for (const b of BUCKETS) {
    if (names.has(b.name)) {
      console.log(`  · exists: ${b.name}`);
      continue;
    }
    const { error: cErr } = await admin.storage.createBucket(b.id, {
      public: b.public,
      fileSizeLimit: b.fileSizeLimit,
      allowedMimeTypes: b.allowedMimeTypes
    });
    if (cErr) {
      // older API shape
      const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
        method: 'POST',
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: b.id,
          name: b.name,
          public: b.public,
          file_size_limit: b.fileSizeLimit,
          allowed_mime_types: b.allowedMimeTypes
        })
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`create bucket ${b.name}: ${res.status} ${t}`);
      }
    }
    console.log(`  ✓ created: ${b.name}`);
  }
}

function migrationFiles() {
  const dir = path.join(process.cwd(), 'supabase', 'migrations');
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => ({ name: f, sql: fs.readFileSync(path.join(dir, f), 'utf8') }));
}

async function runSqlViaPg(sql, label) {
  let pg;
  try {
    pg = require('pg');
  } catch {
    console.log('  · installing pg…');
    require('child_process').execSync('npm install pg --no-save', {
      stdio: 'inherit',
      cwd: process.cwd()
    });
    pg = require('pg');
  }
  const client = new pg.Client({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  try {
    await client.query(sql);
    console.log(`  ✓ ${label}`);
  } finally {
    await client.end();
  }
}

async function runSqlViaManagementApi(sql, label) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: sql })
    }
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Management API ${label}: ${res.status} ${text.slice(0, 500)}`);
  }
  console.log(`  ✓ ${label}`);
}

async function applyMigrations() {
  console.log('→ SQL migrations');
  const files = migrationFiles();
  if (!files.length) {
    console.log('  · no migration files');
    return { applied: false };
  }

  if (DB_URL) {
    for (const f of files) {
      await runSqlViaPg(f.sql, f.name);
    }
    return { applied: true, method: 'postgres' };
  }

  if (ACCESS_TOKEN && PROJECT_REF) {
    for (const f of files) {
      await runSqlViaManagementApi(f.sql, f.name);
    }
    return { applied: true, method: 'management_api' };
  }

  console.log('  ⚠ No SUPABASE_DB_URL / DATABASE_URL or SUPABASE_ACCESS_TOKEN');
  console.log('    Skipping DDL. Add one of:');
  console.log('      SUPABASE_DB_URL=postgresql://postgres.[ref]:[password]@…:5432/postgres');
  console.log('      SUPABASE_ACCESS_TOKEN=sbp_…  (supabase.com account token)');
  return { applied: false, method: null };
}

async function verifySchema() {
  console.log('→ Verify schema');
  const checks = [
    'verdex_kyc_cases',
    'verdex_kyc_evidence',
    'verdex_p2p_entitlements',
    'verdex_p2p_platform_policy',
    'verdex_notification_outbox',
    'verdex_api_idempotency_keys',
    'verdex_audit_events'
  ];
  const ok = [];
  const missing = [];
  for (const table of checks) {
    const { error } = await admin.from(table).select('*').limit(1);
    if (error && /relation|does not exist|42P01|Could not find/i.test(error.message)) {
      missing.push(table);
    } else {
      ok.push(table);
    }
  }
  console.log(`  · present: ${ok.join(', ') || '(none)'}`);
  if (missing.length) console.log(`  · missing: ${missing.join(', ')}`);
  return { ok, missing };
}

async function seedPolicy() {
  console.log('→ Seed platform policy');
  const { data, error } = await admin
    .from('verdex_p2p_platform_policy')
    .select('singleton, p2p_enabled, listing_access_mode')
    .eq('singleton', true)
    .maybeSingle();
  if (error) {
    console.log(`  · skip policy seed: ${error.message}`);
    return;
  }
  if (!data) {
    const { error: insErr } = await admin.from('verdex_p2p_platform_policy').insert({
      singleton: true,
      p2p_enabled: false,
      listing_access_mode: 'explicit_allowlist',
      require_kyc: true,
      require_aml_clear: true
    });
    if (insErr) console.log(`  · insert failed: ${insErr.message}`);
    else console.log('  ✓ policy row inserted (p2p_enabled=false, allowlist)');
  } else {
    console.log(
      `  · policy ok p2p_enabled=${data.p2p_enabled} mode=${data.listing_access_mode}`
    );
  }
}

async function main() {
  console.log('Verdex Supabase auto-setup');
  console.log(`project: ${PROJECT_REF}`);
  await ensureBuckets();
  const mig = await applyMigrations();
  const ver = await verifySchema();
  if (ver.missing.length === 0) {
    await seedPolicy();
  }
  console.log('');
  if (ver.missing.length) {
    console.log('RESULT: buckets ready; SQL still needed for tables.');
    process.exitCode = 2;
  } else {
    console.log(`RESULT: ready (migrations: ${mig.method || 'already applied'})`);
  }
}

main().catch((err) => {
  console.error('FATAL', err.message || err);
  process.exit(1);
});
