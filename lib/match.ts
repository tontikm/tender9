import { getSupabaseServerClient } from "./supabase";

interface MatchingProfile {
  id: string;
  name: string;
  keywords: string[] | null;
  categories: string[] | null;
  provinces: string[] | null;
  min_value: number | null;
  max_value: number | null;
  active: boolean;
}

interface TenderRow {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  province: string | null;
  value_estimate: number | null;
}

/** Simple weighted keyword/category/province score. Title hits count double. */
export function scoreTenderAgainstProfile(
  tenderRow: TenderRow,
  profile: MatchingProfile
): number {
  let score = 0;
  const title = (tenderRow.title || "").toLowerCase();
  const description = (tenderRow.description || "").toLowerCase();

  for (const keyword of profile.keywords ?? []) {
    const kw = keyword.toLowerCase();
    if (title.includes(kw)) score += 2;
    if (description.includes(kw)) score += 1;
  }

  if (
    profile.categories?.length &&
    tenderRow.category &&
    profile.categories.some((c) => c.toLowerCase() === tenderRow.category!.toLowerCase())
  ) {
    score += 2;
  }

  if (
    profile.provinces?.length &&
    tenderRow.province &&
    profile.provinces.some((p) => p.toLowerCase() === tenderRow.province!.toLowerCase())
  ) {
    score += 1;
  }

  if (profile.min_value != null && tenderRow.value_estimate != null) {
    if (tenderRow.value_estimate < profile.min_value) return 0;
  }
  if (profile.max_value != null && tenderRow.value_estimate != null) {
    if (tenderRow.value_estimate > profile.max_value) return 0;
  }

  return score;
}

// Supabase's gateway rejects .in("id", [...]) once the generated URL gets
// too long — this starts failing somewhere between 200 and 500 UUIDs, well
// within range for rematchAllTenders() once there are 500+ tenders. Chunk
// both the SELECT and the upsert so this scales regardless of table size.
const CHUNK_SIZE = 200;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Runs all active matching profiles against a batch of tender rows and
 * upserts hits into tender_matches. Call this after upserting new/updated
 * tenders in an ingestion run.
 */
export async function matchTenders(tenderIds: string[]): Promise<number> {
  if (tenderIds.length === 0) return 0;

  const supabase = getSupabaseServerClient();

  const { data: profiles, error: profilesError } = await supabase
    .from("matching_profiles")
    .select("*")
    .eq("active", true);

  if (profilesError) throw profilesError;
  if (!profiles || profiles.length === 0) return 0;

  const tenderRows: TenderRow[] = [];
  for (const idChunk of chunk(tenderIds, CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("tenders")
      .select("id, title, description, category, province, value_estimate")
      .in("id", idChunk);

    if (error) throw error;
    tenderRows.push(...(data ?? []));
  }

  const matchesToInsert: {
    tender_id: string;
    profile_id: string;
    match_score: number;
  }[] = [];

  for (const tenderRow of tenderRows) {
    for (const profile of profiles as MatchingProfile[]) {
      const score = scoreTenderAgainstProfile(tenderRow, profile);
      // When a profile specifies categories, require a real signal — a
      // category match or a title-keyword match, both worth 2 — so a single
      // stray keyword in a long description can't pull in out-of-category
      // tenders (e.g. an electrical/construction bid that happens to mention
      // "cabling" or "UPS"). Keyword-only profiles keep the looser threshold.
      const minScore = (profile.categories?.length ?? 0) > 0 ? 2 : 1;
      if (score >= minScore) {
        matchesToInsert.push({
          tender_id: tenderRow.id,
          profile_id: profile.id,
          match_score: score,
        });
      }
    }
  }

  // Prune stale matches: within the tenders we just re-scored, delete any
  // 'new' match for an *active* profile that no longer qualifies (score 0),
  // so narrowing/editing a profile drops old matches instead of leaving them
  // behind. saved/applied/dismissed are kept — the user has already engaged
  // with those. Matches for inactive profiles are left untouched.
  const activeProfileIds = new Set((profiles as MatchingProfile[]).map((p) => p.id));
  const shouldExist = new Set(matchesToInsert.map((m) => `${m.tender_id}:${m.profile_id}`));

  for (const idChunk of chunk(tenderIds, CHUNK_SIZE)) {
    const { data: existing, error: existingError } = await supabase
      .from("tender_matches")
      .select("id, tender_id, profile_id")
      .in("tender_id", idChunk)
      .eq("status", "new");

    if (existingError) throw existingError;

    const staleIds = (existing ?? [])
      .filter(
        (m) =>
          activeProfileIds.has(m.profile_id) &&
          !shouldExist.has(`${m.tender_id}:${m.profile_id}`)
      )
      .map((m) => m.id);

    for (const delChunk of chunk(staleIds, CHUNK_SIZE)) {
      const { error: delError } = await supabase.from("tender_matches").delete().in("id", delChunk);
      if (delError) throw delError;
    }
  }

  if (matchesToInsert.length === 0) return 0;

  for (const matchChunk of chunk(matchesToInsert, CHUNK_SIZE)) {
    const { error: upsertError } = await supabase
      .from("tender_matches")
      .upsert(matchChunk, { onConflict: "tender_id,profile_id" });

    if (upsertError) throw upsertError;
  }

  return matchesToInsert.length;
}

/**
 * Re-scores every tender in the table against all active profiles. Call
 * this after creating/editing/deleting a profile so match results reflect
 * the new criteria immediately, instead of waiting for the next ingestion.
 */
export async function rematchAllTenders(): Promise<number> {
  const supabase = getSupabaseServerClient();

  const tenderIds: string[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("tenders")
      .select("id")
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    tenderIds.push(...data.map((row) => row.id));
    if (data.length < pageSize) break;
  }

  return matchTenders(tenderIds);
}
