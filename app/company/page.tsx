import { getSupabaseAuthClient, getCurrentUser } from "@/lib/supabase-auth";
import { CompanyForm, type CompanyProfile } from "./CompanyForm";

export const dynamic = "force-dynamic";

export default async function CompanyPage() {
  const user = await getCurrentUser();
  const supabase = await getSupabaseAuthClient();

  const { data: profile, error } = await supabase
    .from("company_profiles")
    .select("*")
    .eq("user_id", user?.id ?? "")
    .maybeSingle<CompanyProfile>();

  return (
    <main>
      <h1>Company profile</h1>
      <p className="subtitle">
        Your business details, used to pre-fill bid paperwork (SBD forms and similar). This is
        separate from your matching profiles: it describes who you are, not which tenders you want.
      </p>

      {error && <p className="empty-state">Failed to load company profile: {error.message}</p>}

      <article className="profile-card">
        <CompanyForm profile={profile ?? null} />
      </article>
    </main>
  );
}
