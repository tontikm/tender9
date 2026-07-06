import { getSupabaseServerClient } from "@/lib/supabase";
import { saveProfile, deleteProfile } from "./actions";

export const dynamic = "force-dynamic";

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

function ProfileForm({ profile }: { profile: Profile | null }) {
  const formId = `profile-form-${profile?.id ?? "new"}`;

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
          <label>Keywords (comma-separated)</label>
          <input type="text" name="keywords" defaultValue={profile?.keywords?.join(", ") ?? ""} />
          <span className="hint">Matched against tender title (2 pts) and description (1 pt).</span>
        </div>

        <div className="form-field full">
          <label>Categories (comma-separated, must match exactly)</label>
          <input type="text" name="categories" defaultValue={profile?.categories?.join(", ") ?? ""} />
          <span className="hint">
            e.g. Supplies: Computer Equipment, Information and communication (+2 pts on exact match)
          </span>
        </div>

        <div className="form-field full">
          <label>Provinces (comma-separated, leave blank for national)</label>
          <input type="text" name="provinces" defaultValue={profile?.provinces?.join(", ") ?? ""} />
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

export default async function ProfilesPage() {
  const supabase = getSupabaseServerClient();
  const { data: profiles, error } = await supabase
    .from("matching_profiles")
    .select("*")
    .order("created_at", { ascending: true })
    .returns<Profile[]>();

  return (
    <main>
      <nav className="page-nav">
        <a href="/">&larr; Back to matched tenders</a>
      </nav>
      <h1>Matching profiles</h1>
      <p className="subtitle">
        Tenders are scored against every active profile below. Editing or adding a profile
        immediately re-scores all tenders.
      </p>

      {error && <p className="empty-state">Failed to load profiles: {error.message}</p>}

      {profiles?.map((profile) => (
        <article className={`profile-card ${profile.active ? "" : "inactive"}`} key={profile.id}>
          <ProfileForm profile={profile} />
        </article>
      ))}

      <article className="profile-card">
        <h3 style={{ marginTop: 0 }}>Add a new profile</h3>
        <ProfileForm profile={null} />
      </article>
    </main>
  );
}
