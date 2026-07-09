import { NextResponse } from "next/server";
import { getSupabaseAuthClient } from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

// Google (via Supabase) redirects here after the consent screen. We exchange
// the one-time code for a session (the PKCE verifier was stored in a cookie
// when sign-in started), set the session cookies, and send the user on.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  const next = url.searchParams.get("next") ?? "/dashboard";

  // Behind Vercel's proxy, request.url's origin is unreliable — rebuild it
  // from the forwarded headers so redirects land on the real host.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const origin = forwardedHost ? `${proto}://${forwardedHost}` : url.origin;

  const fail = (message: string) =>
    NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(message)}`);

  if (oauthError) return fail(oauthError);
  if (!code) return fail("Sign-in was cancelled.");

  const supabase = await getSupabaseAuthClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail(error.message);

  return NextResponse.redirect(`${origin}${next}`);
}
