import { createClient } from "@supabase/supabase-js";

// Server-side only. Never import this file from client components.
// Uses the service role key, which bypasses RLS — that's intentional
// for this internal tool, but means every API route using this client
// is fully trusted code, not user-facing input passthrough.
export function getSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing Supabase env vars. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local"
    );
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}
