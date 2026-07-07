import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Auth-aware Supabase client bound to the request's cookies — used for
 * reading/writing the user's session (sign in/up/out, getUser()).
 * Uses the anon key, unlike lib/supabase.ts's service-role client which
 * is for trusted server-side data operations, not session handling.
 */
export async function getSupabaseAuthClient() {
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
}

export async function getCurrentUser() {
  const supabase = await getSupabaseAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
