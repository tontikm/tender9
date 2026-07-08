import { getSupabaseAuthClient, getCurrentUser } from "@/lib/supabase-auth";
import { saveProfile, deleteProfile } from "./actions";

export const dynamic = "force-dynamic";
// saveProfile/deleteProfile call rematchAllTenders(), which re-scores every
// tender in the table — can take longer than Vercel's default function
// timeout as the tenders table grows, same reasoning as api/ingest/route.ts.
export const maxDuration = 60;

const SA_PROVINCES = [
  "Eastern Cape",
  "Free State",
  "Gauteng",
  "KwaZulu-Natal",
  "Limpopo",
  "Mpumalanga",
  "North West",
  "Northern Cape",
  "Western Cape",
];

interface Profile {
  id: string;
  name: string;
  keywords: string[] | null;
  categories: string[] | null;
  provinces: string[] | null;
  min_value: number | null;
  max_value: number | null;
  cidb_grade: string | null;
  active: boolean;
}

function ProfileForm({
  profile,
  availableCategories,
}: {
  profile: Profile | null;
  availableCategories: string[];
}) {
  const formId = `profile-form-${profile?.id ?? "new"}`;
  const selectedCategories = new Set(profile?.categories ?? []);
  const selectedProvinces = new Set(profile?.provinces ?? []);

  return (
    <>
      <form action={saveProfile} className="profile-card-form" id={formId}>
      {profile && <input type="hidden" name="id" value={profile.id} />}
      <div className="form-grid">
        <div className="form-field full">
          <label>Profile name</label>
          <input type="text" name="name" defaultValue={profile?.name ?? ""} required />
        </div>

        <div className="form-field full">
          <label>Keywords (one per line)</label>
          <textarea name="keywords" rows={4} defaultValue={profile?.keywords?.join("\n") ?? ""} />
          <span className="hint">Matched against tender title (2 pts) and description (1 pt).</span>
        </div>

        <div className="form-field full">
          <label>Categories</label>
          <div className="checkbox-list">
            {availableCategories.map((category) => {
              const checkboxId = `${formId}-category-${category}`;
              return (
                <span className="checkbox-list-item" key={category}>
                  <input
                    type="checkbox"
                    name="categories"
                    value={category}
                    id={checkboxId}
                    defaultChecked={selectedCategories.has(category)}
                  />
                  <label htmlFor={checkboxId}>{category}</label>
                </span>
              );
            })}
          </div>
          <span className="hint">Select the tender categories relevant to your business (+2 pts on match).</span>
        </div>

        <div className="form-field full">
          <label>Provinces (leave all unchecked for national)</label>
          <div className="checkbox-list checkbox-list-inline">
            {SA_PROVINCES.map((province) => {
              const checkboxId = `${formId}-province-${province}`;
              return (
                <span className="checkbox-list-item" key={province}>
                  <input
                    type="checkbox"
                    name="provinces"
                    value={province}
                    id={checkboxId}
                    defaultChecked={selectedProvinces.has(province)}
                  />
                  <label htmlFor={checkboxId}>{province}</label>
                </span>
              );
            })}
          </div>
        </div>

        <div className="form-field">
          <label>Min value (ZAR)</label>
          <input type="number" name="min_value" defaultValue={profile?.min_value ?? ""} />
        </div>

        <div className="form-field">
          <label>Max value (ZAR)</label>
          <input type="number" name="max_value" defaultValue={profile?.max_value ?? ""} />
        </div>

        <div className="form-field">
          <label>CIDB grade</label>
          <input type="text" name="cidb_grade" defaultValue={profile?.cidb_grade ?? ""} />
        </div>

        <div className="form-field">
          <label>&nbsp;</label>
          <span className="form-field-inline">
            <input
              type="checkbox"
              name="active"
              id={`active-${profile?.id ?? "new"}`}
              defaultChecked={profile?.active ?? true}
            />
            <label htmlFor={`active-${profile?.id ?? "new"}`}>Active</label>
          </span>
        </div>
      </div>
      </form>

      <div className="form-footer">
        {profile ? (
          <form action={deleteProfile.bind(null, profile.id)}>
            <button type="submit" className="delete-button">
              Delete profile
            </button>
          </form>
        ) : (
          <span />
        )}
        <button type="submit" form={formId}>
          {profile ? "Save changes" : "Add profile"}
        </button>
      </div>
    </>
  );
}

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
  const { data: profiles, error } = await supabase
    .from("matching_profiles")
    .select("*")
    .eq("user_id", user?.id ?? "")
    .order("created_at", { ascending: true })
    .returns<Profile[]>();

  const availableCategories = await fetchDistinctCategories(supabase);

  return (
    <main>
      <h1>Matching profiles</h1>
      <p className="subtitle">
        Tenders are scored against every active profile below. Editing or adding a profile
        immediately re-scores all tenders.
      </p>

      {error && <p className="empty-state">Failed to load profiles: {error.message}</p>}

      {profiles?.map((profile) => (
        <article className={`profile-card ${profile.active ? "" : "inactive"}`} key={profile.id}>
          <ProfileForm profile={profile} availableCategories={availableCategories} />
        </article>
      ))}

      <article className="profile-card">
        <h3 style={{ marginTop: 0 }}>Add a new profile</h3>
        <ProfileForm profile={null} availableCategories={availableCategories} />
      </article>
    </main>
  );
}
