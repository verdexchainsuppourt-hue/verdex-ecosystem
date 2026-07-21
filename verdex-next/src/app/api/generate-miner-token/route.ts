import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Generate token in the exact same way as token-create.js:
    // 'vdxt_' + 32 bytes hex
    const rawToken = 'vdxt_' + crypto.randomBytes(32).toString('hex');
    const tokenPrefix = rawToken.slice(0, 12);
    const tokenHash = await bcrypt.hash(rawToken, 12);
    const now = new Date().toISOString();

    // We must write this using the service role key to bypass row level security 
    // and write to the api_tokens table on behalf of the user.
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://unbzescopxtmtbrgqlhh.supabase.co";

    if (!serviceRoleKey) {
      return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured" }, { status: 500 });
    }

    // Read details from request body if available
    let body = {};
    try {
      body = await req.json();
    } catch (e) {}
    const name = (body as any).name || "CLI Miner Device";
    const deviceName = (body as any).device_name || null;

    // Create a supabase client with the service role key
    const cookieStore = await cookies();
    const serviceClient = createServerClient(supabaseUrl, serviceRoleKey, {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {}
        }
      }
    });

    const { error } = await serviceClient.from('api_tokens').insert({
      user_id: user.id,
      name: name,
      token_hash: tokenHash,
      token_prefix: tokenPrefix,
      scope: ['mining'],
      is_active: true,
      created_at: now,
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      device_name: deviceName,
    });

    if (error) {
      console.error("Database error inserting token:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ token: rawToken, tokenPrefix });
  } catch (error) {
    console.error("Error generating miner token:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

