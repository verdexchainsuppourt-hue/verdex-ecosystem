// Force all dashboard routes to be dynamic (server-rendered, never prerendered)
// This prevents Supabase SSR from failing during Next.js build with no env vars
export const dynamic = "force-dynamic";
