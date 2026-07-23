import { getSupabaseAuthClient, getCurrentUser } from "@/lib/supabase-auth";
import { ProfilesManager, type Profile } from "./ProfilesManager";

export const dynamic = "force-dynamic";
// saveProfile/setProfileActive run rematchAllTenders() after the response via
// next/server's after(), which re-scores every tender in the table — this
// keeps the function alive long enough for that background work to finish,
// same reasoning as api/ingest/route.ts.
export const maxDuration = 60;

async function fetchDistinctCategories(
  supabase: Awaited<ReturnType<typeof getSupabaseAuthClient>>
): Promise<string[]> {
  const categories = new Set<string>();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("tenders")
      .select("category")
      .not("category", "is", null)
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) {
      if (row.category) categories.add(row.category);
    }
    if (data.length < pageSize) break;
  }
  return Array.from(categories).sort((a, b) => a.localeCompare(b));
}

export default async function ProfilesPage() {
  const user = await getCurrentUser();
  const supabase = await getSupabaseAuthClient();

  const [{ data: profiles, error }, availableCategories] = await Promise.all([
    supabase
      .from("matching_profiles")
      .select("*")
      .eq("user_id", user?.id ?? "")
      .order("created_at", { ascending: true })
      .returns<Profile[]>(),
    fetchDistinctCategories(supabase),
  ]);

  return (
    <main>
      <h1>Matching profiles</h1>
      <p className="subtitle">
        Tenders are scored against every active profile below. Editing or adding a profile
        immediately re-scores all tenders.
      </p>

      {error && <p className="empty-state">Failed to load profiles: {error.message}</p>}

      <ProfilesManager profiles={profiles ?? []} availableCategories={availableCategories} />
    </main>
  );
}
