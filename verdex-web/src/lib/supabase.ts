import { createClient } from "@supabase/supabase-js";

/**
 * Public Supabase anon credentials — identical to the production client
 * (js/auth.js). The anon key is safe for browsers; row-level security on the
 * backend enforces data isolation.
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://unbzescopxtmtbrgqlhh.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVuYnplc2NvcHh0bXRicmdxbGhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1Njc1MjcsImV4cCI6MjA5OTE0MzUyN30.jHm7uIV_fBWIP-EFl3d2AY5P42X3tcIIbEGwNfSYiPM";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
