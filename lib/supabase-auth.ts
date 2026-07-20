import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Session-bound Supabase client (anon key + the signed-in user's cookies).
 * Use this for everything user-facing — session handling (sign in/up/out,
 * getUser()) AND data access on matching_profiles/tender_matches/tenders/
 * ingestion_runs — since RLS policies key off auth.uid() from this client's
 * JWT. lib/supabase.ts's service-role client bypasses RLS entirely and is
 * reserved for the ingestion cron and cross-tenant matching logic.
 *
 * Wrapped in React cache() so a single request render (e.g. the Header plus
 * the page component) reuses one client instead of re-reading cookies and
 * constructing a fresh client per call.
 */
export const getSupabaseAuthClient = cache(async () => {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component render (cookies are read-only there) —
            // safe to ignore since the middleware refreshes the session on navigation.
          }
        },
      },
    }
  );
});

/**
 * The current signed-in user. Validating the JWT is a network round-trip to
 * Supabase Auth (~300-700ms), and this is called from both the Header and
 * every page — so it's wrapped in React cache() to collapse those into a
 * single call per request render.
 */
export const getCurrentUser = cache(async () => {
  const supabase = await getSupabaseAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
