import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { fetchOcdsReleases, normalizeRelease } from "@/lib/ocds";
import { matchTenders } from "@/lib/match";

export const dynamic = "force-dynamic"; // never cache — this must run fresh every time
export const maxDuration = 60; // seconds; adjust in vercel.json / plan limits if needed

/**
 * GET /api/ingest
 * Protected by CRON_SECRET — Vercel Cron sends this automatically if configured
 * in vercel.json, or you can call it manually with:
 *   curl https://your-app.vercel.app/api/ingest -H "Authorization: Bearer YOUR_CRON_SECRET"
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;

  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseServerClient();

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
    // Find the last successful run to fetch only new/updated releases since then.
    const { data: lastRun } = await supabase
      .from("ingestion_runs")
      .select("finished_at")
      .eq("source", "etenders_ocds")
      .eq("status", "success")
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const releases = await fetchOcdsReleases(lastRun?.finished_at ?? undefined);

    let newCount = 0;
    let updatedCount = 0;
    const affectedIds: string[] = [];

    for (const release of releases) {
      const normalized = normalizeRelease(release);
      if (!normalized) continue;

      const { data: existing } = await supabase
        .from("tenders")
        .select("id")
        .eq("source", normalized.source)
        .eq("external_id", normalized.external_id)
        .maybeSingle();

      const { data: upserted, error: upsertError } = await supabase
        .from("tenders")
        .upsert(
          { ...normalized, updated_at: new Date().toISOString() },
          { onConflict: "source,external_id" }
        )
        .select("id")
        .single();

      if (upsertError || !upserted) {
        // Don't let one bad record kill the whole batch — log and continue.
        console.error("Failed to upsert tender", normalized.external_id, upsertError);
        continue;
      }

      affectedIds.push(upserted.id);
      if (existing) updatedCount += 1;
      else newCount += 1;
    }

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
  } catch (err: any) {
    await supabase
      .from("ingestion_runs")
      .update({
        finished_at: new Date().toISOString(),
        status: "failed",
        error_message: String(err?.message ?? err),
      })
      .eq("id", runRow.id);

    return NextResponse.json(
      { status: "failed", error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
