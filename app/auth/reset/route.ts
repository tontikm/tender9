import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAuthClient } from "@/lib/supabase-auth";

// Target of the password-reset email link. Exchanges Supabase's one-time
// code for a real (recovery) session — cookie-setting only works in a route
// handler/server action, not a plain Server Component — then hands off to
// the actual "choose a new password" form.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(
      new URL(`/forgot-password?error=${encodeURIComponent("That reset link is invalid or has expired.")}`, request.url)
    );
  }

  const supabase = await getSupabaseAuthClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL(`/forgot-password?error=${encodeURIComponent(error.message)}`, request.url));
  }

  return NextResponse.redirect(new URL("/reset-password", request.url));
}
