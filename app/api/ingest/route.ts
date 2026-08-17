import { timingSafeEqual, createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import {
  fetchOcdsReleases,
  normalizeRelease,
  DEFAULT_LOOKBACK_DAYS,
  type NormalizedTender,
} from "@/lib/ocds";
import { matchTenders } from "@/lib/match";

// A run stuck in "running" past this long almost certainly crashed rather
// than finished — mark it failed so the dashboard banner doesn't say
// "still running" forever.
const STALE_RUN_MINUTES = 10;

// Hashing both sides to a fixed length before comparing avoids leaking the
// secret's length via timingSafeEqual's own length check.
function safeCompare(a: string, b: string): boolean {
  const ah = createHash("sha256").update(a).digest();
  const bh = createHash("sha256").update(b).digest();
  return timingSafeEqual(ah, bh);
}

// fetch() failures (DNS, connection refused, TLS, timeout) reject with a
// generic "fetch failed" TypeError whose real cause lives one level down in
// `.cause` — surfacing it is the difference between an error_message that's
// actually debuggable and one that just says "fetch failed" every time.
function errorMessage(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as Error & { cause?: unknown }).cause;
  if (!cause) return err.message;
  const causeMsg = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
  return `${err.message} (${causeMsg})`;
}

export const dynamic = "force-dynamic"; // never cache — this must run fresh every time
export const maxDuration = 60; // seconds; adjust in vercel.json / plan limits if needed

// Never try to catch up more than this in one run — bounds the work so a run
// can't blow the 60s timeout after a gap. With WINDOW_DAYS=1 (lib/ocds.ts)
// each day's window is ~9s worst case in isolation, but a live 4-day catch-up
// run measured at 56s total once DB upsert/match work is included — too
// close to the 60s ceiling for comfort. 3 days leaves real margin. If the
// cron is down longer than this, the oldest tail is skipped rather than risk
// a run that times out and never marks success — once any run succeeds, the
// next one resumes from "since last success" and closes the rest of the gap
// a few days at a time rather than reopening it.
const MAX_CATCHUP_DAYS = 3;

const UPSERT_CHUNK = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * GET /api/ingest
 * Protected by CRON_SECRET — Vercel Cron sends this automatically if configured
 * in vercel.json, or you can call it manually with:
 *   curl https://your-app.vercel.app/api/ingest -H "Authorization: Bearer YOUR_CRON_SECRET"
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET;

  if (!secret || !safeCompare(authHeader, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseServerClient();

  // Close out any run left stuck in "running" from a crashed previous
  // invocation, before starting this one.
  const staleThreshold = new Date(Date.now() - STALE_RUN_MINUTES * 60_000).toISOString();
  await supabase
    .from("ingestion_runs")
    .update({
      status: "failed",
      error_message: "Timed out, marked stale by a later run",
      finished_at: new Date().toISOString(),
    })
    .eq("source", "etenders_ocds")
    .eq("status", "running")
    .lt("started_at", staleThreshold);

  const { data: runRow, error: runInsertError } = await supabase
    .from("ingestion_runs")
    .insert({ source: "etenders_ocds", status: "running" })
    .select()
    .single();

  if (runInsertError || !runRow) {
    return NextResponse.json(
      { error: "Failed to create ingestion run record", details: runInsertError },
      { status: 500 }
    );
  }

  try {
    // Date range to fetch. Query params (?from=&to=, YYYY-MM-DD) allow a
    // manual targeted run; otherwise fetch from the last *successful* run's
    // day up to today — using "last success" (not "last run") means a hung or
    // failed run never opens a permanent gap, since the next run re-covers it.
    const url = new URL(request.url);
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");

    const today = isoDay(new Date());
    let dateFrom: string;
    let dateTo: string;

    if (fromParam && toParam) {
      dateFrom = fromParam;
      dateTo = toParam;
    } else {
      const { data: lastRun } = await supabase
        .from("ingestion_runs")
        .select("finished_at")
        .eq("source", "etenders_ocds")
        .eq("status", "success")
        .order("finished_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      dateTo = today;
      const sinceDay = lastRun?.finished_at
        ? lastRun.finished_at.slice(0, 10)
        : isoDay(new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * 86_400_000));
      // Bound the catch-up so a long outage can't produce a run that times out.
      const floorDay = isoDay(new Date(Date.now() - MAX_CATCHUP_DAYS * 86_400_000));
      dateFrom = sinceDay < floorDay ? floorDay : sinceDay;
    }

    const releases = await fetchOcdsReleases(dateFrom, dateTo);

    // Normalize and dedupe by (source, external_id) — Postgres upsert can't
    // touch the same conflict target twice in one statement, and our date
    // windows can legitimately return the same ocid at their edges.
    const normalizedById = new Map<string, NormalizedTender>();
    for (const release of releases) {
      const n = normalizeRelease(release);
      if (n) normalizedById.set(`${n.source}:${n.external_id}`, n);
    }
    const records = [...normalizedById.values()];

    // Which of these already exist? (for the new-vs-updated stat only)
    // Chunks are independent lookups, so fetch them all in parallel.
    const existingExternalIds = new Set<string>();
    const idChunks = chunk(records.map((r) => r.external_id), 200);
    const existingResults = await Promise.all(
      idChunks.map((idChunk) =>
        supabase.from("tenders").select("external_id").eq("source", "etenders_ocds").in("external_id", idChunk)
      )
    );
    for (const { data } of existingResults) {
      for (const row of data ?? []) existingExternalIds.add(row.external_id);
    }

    const nowTs = new Date().toISOString();
    const affectedIds: string[] = [];
    for (const recChunk of chunk(records, UPSERT_CHUNK)) {
      const { data: upserted, error: upsertError } = await supabase
        .from("tenders")
        .upsert(
          recChunk.map((r) => ({ ...r, updated_at: nowTs })),
          { onConflict: "source,external_id" }
        )
        .select("id");

      if (upsertError) throw upsertError;
      affectedIds.push(...(upserted ?? []).map((r) => r.id));
    }

    const newCount = records.filter((r) => !existingExternalIds.has(r.external_id)).length;
    const updatedCount = records.length - newCount;

    const matchCount = await matchTenders(affectedIds);

    await supabase
      .from("ingestion_runs")
      .update({
        finished_at: new Date().toISOString(),
        records_fetched: releases.length,
        records_new: newCount,
        records_updated: updatedCount,
        status: "success",
      })
      .eq("id", runRow.id);

    return NextResponse.json({
      status: "success",
      fetched: releases.length,
      new: newCount,
      updated: updatedCount,
      matches: matchCount,
    });
  } catch (err: unknown) {
    await supabase
      .from("ingestion_runs")
      .update({
        finished_at: new Date().toISOString(),
        status: "failed",
        error_message: errorMessage(err),
      })
      .eq("id", runRow.id);

    return NextResponse.json({ status: "failed", error: errorMessage(err) }, { status: 500 });
  }
}
