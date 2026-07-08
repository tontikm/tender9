import { createClient } from "@supabase/supabase-js";

// Server-side only. Never import this file from client components.
// Uses the service role key, which bypasses RLS. Reserved for the
// ingestion cron and cross-tenant matching logic (lib/ocds.ts,
// lib/match.ts, app/api/ingest/route.ts) — the only things that
// legitimately need to read/write across every account at once.
// User-facing pages/actions must use lib/supabase-auth.ts instead, so
// RLS (scoped by auth.uid()) is the real enforcement boundary.
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
