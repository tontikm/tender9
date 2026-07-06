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

  const { data: tenderRows, error: tendersError } = await supabase
    .from("tenders")
    .select("id, title, description, category, province, value_estimate")
    .in("id", tenderIds);

  if (tendersError) throw tendersError;
  if (!tenderRows) return 0;

  const matchesToInsert: {
    tender_id: string;
    profile_id: string;
    match_score: number;
  }[] = [];

  for (const tenderRow of tenderRows) {
    for (const profile of profiles as MatchingProfile[]) {
      const score = scoreTenderAgainstProfile(tenderRow, profile);
      if (score > 0) {
        matchesToInsert.push({
          tender_id: tenderRow.id,
          profile_id: profile.id,
          match_score: score,
        });
      }
    }
  }

  if (matchesToInsert.length === 0) return 0;

  const { error: upsertError } = await supabase
    .from("tender_matches")
    .upsert(matchesToInsert, { onConflict: "tender_id,profile_id" });

  if (upsertError) throw upsertError;

  return matchesToInsert.length;
}
