// Verdex Auth Client — Supabase Google OAuth + session management
// Loaded on dashboard.html and any protected page

const SUPABASE_URL = 'https://unbzescopxtmtbrgqlhh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVuYnplc2NvcHh0bXRicmdxbGhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1Njc1MjcsImV4cCI6MjA5OTE0MzUyN30.jHm7uIV_fBWIP-EFl3d2AY5P42X3tcIIbEGwNfSYiPM';

// Create Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

// ============================================
// AUTH FUNCTIONS
// ============================================

// Sign up with email + password
async function signUpWithEmail(email, password) {
  const { data, error } = await supabase.auth.signUp({
    email: email,
    password: password,
    options: {
      emailRedirectTo: window.location.origin + '/dashboard'
    }
  });
  return { data, error };
}

// Sign in with email + password
async function signInWithEmail(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email,
    password: password
  });
  return { data, error };
}

// Sign in with Google OAuth
async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + '/dashboard'
    }
  });
  if (error) {
    console.error('Sign in error:', error);
    showAuthError(error.message);
  }
  return data;
}

// Get current session
async function getSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  return session;
}

// Get current user
async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  return user;
}

// Sign out
async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('Sign out error:', error);
  }
  window.location.href = '/';
}

// ============================================
// PROFILE + WALLET FUNCTIONS
// ============================================

// Fetch the user's profile
async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) console.error('Profile fetch error:', error);
  return data;
}

// Fetch the user's wallet
async function fetchWallet(userId) {
  const { data, error } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (error) console.error('Wallet fetch error:', error);
  return data;
}

// Fetch point transactions (history)
async function fetchTransactions(userId, limit = 20) {
  const { data, error } = await supabase
    .from('point_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) console.error('Transactions fetch error:', error);
  return data;
}

// Fetch mining sessions
async function fetchMiningSessions(userId) {
  const { data, error } = await supabase
    .from('mining_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) console.error('Sessions fetch error:', error);
  return data;
}

// Fetch mining config (global settings)
async function fetchMiningConfig() {
  const { data, error } = await supabase
    .from('mining_config')
    .select('key, value');
  if (error) {
    console.error('Config fetch error:', error);
    return {};
  }
  const config = {};
  data.forEach(item => { config[item.key] = item.value; });
  return config;
}

// Fetch API tokens
async function fetchApiTokens(userId) {
  const { data, error } = await supabase
    .from('api_tokens')
    .select('id, name, token_prefix, scope, created_at, last_used_at, is_active, expires_at, device_name')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) console.error('Tokens fetch error:', error);
  return data;
}

// Revoke an API token
async function revokeToken(tokenId) {
  const { data, error } = await supabase
    .from('api_tokens')
    .update({ is_active: false, revoked_at: new Date().toISOString() })
    .eq('id', tokenId);
  return !error;
}

// Create a new API token via backend
async function createApiToken(name, deviceName) {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');
  
  const r = await fetch('/api/mining/token-create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + session.access_token
    },
    body: JSON.stringify({ name: name || 'CLI Miner', device_name: deviceName || null })
  });
  return r.json();
}

// ============================================
// KYC / P2P STATUS (server-authoritative)
// ============================================

async function fetchKycStatus() {
  const session = await getSession();
  if (!session) return null;
  const r = await fetch('/api/kyc?action=me', {
    headers: {
      'Authorization': 'Bearer ' + session.access_token,
      'X-Trace-Id': (crypto.randomUUID && crypto.randomUUID()) || String(Date.now())
    }
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    console.error('KYC status error:', err);
    return null;
  }
  return r.json();
}

async function fetchKycConfig() {
  const session = await getSession();
  if (!session) return null;
  const r = await fetch('/api/kyc?action=config', {
    headers: { 'Authorization': 'Bearer ' + session.access_token }
  });
  if (!r.ok) return null;
  return r.json();
}

/** Expose for kyc-moderation.html and dashboard widgets */
window.__VERDEX_AUTH = {
  url: SUPABASE_URL,
  anon: SUPABASE_ANON_KEY,
  getSession,
  getCurrentUser,
  fetchKycStatus,
  fetchKycConfig
};
window.verdexAuth = {
  getSession,
  getCurrentUser,
  signOut,
  fetchKycStatus,
  fetchKycConfig
};

// ============================================
// AUTH STATE LISTENER
// ============================================

supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN') {
    console.log('User signed in');
    if (window.location.hash && window.location.hash.includes('access_token')) {
      history.replaceState(null, '', window.location.pathname);
    }
    if (typeof onAuthSuccess === 'function') onAuthSuccess(session.user);
  } else if (event === 'SIGNED_OUT') {
    console.log('User signed out');
    if (typeof onAuthSignOut === 'function') onAuthSignOut();
  }
});

// ============================================
// UI HELPERS
// ============================================

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  if (el) {
    el.textContent = msg;
    el.style.display = 'block';
  }
}

function formatNumber(n) {
  return new Intl.NumberFormat('en-US').format(n);
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function shortAddress(addr) {
  if (!addr) return 'Not set up';
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}
