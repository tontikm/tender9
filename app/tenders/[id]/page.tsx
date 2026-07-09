import { notFound } from "next/navigation";
import { getSupabaseAuthClient, getCurrentUser } from "@/lib/supabase-auth";
import { updateMatchStatus } from "../../actions";
import { IconBuilding, IconTag, IconMapPin, IconCoin } from "../../components/icons";
import { formatDate, formatDateTime, formatValue } from "@/lib/format";
import { extractRequirements } from "@/lib/requirements";

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<string, string> = {
  goods: "goods",
  services: "services",
  works: "works / construction",
};

interface Tender {
  id: string;
  title: string;
  description: string | null;
  buyer_name: string | null;
  category: string | null;
  province: string | null;
  value_estimate: number | null;
  currency: string | null;
  status: string | null;
  closing_date: string | null;
  briefing_date: string | null;
  published_date: string | null;
  document_urls: string[] | null;
  raw_payload: unknown;
}

interface MatchRow {
  id: string;
  match_score: number | null;
  status: string;
  matching_profiles: { name: string } | null;
}

export default async function TenderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  const supabase = await getSupabaseAuthClient();

  const { data: tender } = await supabase
    .from("tenders")
    .select(
      "id, title, description, buyer_name, category, province, value_estimate, currency, status, closing_date, briefing_date, published_date, document_urls, raw_payload"
    )
    .eq("id", id)
    .maybeSingle<Tender>();

  if (!tender) notFound();

  const requirements = extractRequirements(tender.raw_payload);

  const { data: matches } = await supabase
    .from("tender_matches")
    .select("id, match_score, status, matching_profiles!inner(name, user_id)")
    .eq("tender_id", id)
    .eq("matching_profiles.user_id", user?.id ?? "")
    .order("match_score", { ascending: false })
    .returns<MatchRow[]>();

  // Mark this tender as viewed for the current user the first time they open
  // it, so the dashboard can show which tenders they've already looked at.
  // RLS scopes the update to the user's own matches; `.is("viewed_at", null)`
  // means only the first view is recorded and re-visits don't overwrite it.
  await supabase
    .from("tender_matches")
    .update({ viewed_at: new Date().toISOString() })
    .eq("tender_id", id)
    .is("viewed_at", null);

  return (
    <main>
      <nav className="page-nav">
        <a href="/dashboard">&larr; Back to matched tenders</a>
        <a href={`/tenders/${tender.id}/bid-pack`} className="page-nav-cta">
          Prepare SBD forms
        </a>
      </nav>

      <h1>{tender.title}</h1>

      <div className="match-meta detail-meta">
        <span className="meta-item">
          <IconBuilding className="meta-icon" />
          {tender.buyer_name ?? "Unknown buyer"}
        </span>
        <span className="meta-item">
          <IconTag className="meta-icon" />
          {tender.category ?? "Uncategorized"}
        </span>
        <span className="meta-item">
          <IconMapPin className="meta-icon" />
          {tender.province ?? "National"}
        </span>
        <span className="meta-item">
          <IconCoin className="meta-icon" />
          {formatValue(tender.value_estimate, tender.currency)}
        </span>
      </div>

      <div className="detail-grid">
        <div className="detail-field">
          <span className="detail-label">Status</span>
          <span>{tender.status ?? "—"}</span>
        </div>
        <div className="detail-field">
          <span className="detail-label">Published</span>
          <span>{formatDate(tender.published_date)}</span>
        </div>
        <div className="detail-field">
          <span className="detail-label">Briefing session</span>
          <span>{formatDateTime(tender.briefing_date)}</span>
        </div>
        <div className="detail-field">
          <span className="detail-label">Closing date</span>
          <span>{formatDateTime(tender.closing_date)}</span>
        </div>
      </div>

      {tender.description && (
        <>
          <h3 className="section-heading">Description</h3>
          <p className="detail-description">{tender.description}</p>
        </>
      )}

      {tender.document_urls && tender.document_urls.length > 0 && (
        <>
          <h3 className="section-heading">Documents</h3>
          <ul className="document-list">
            {tender.document_urls.map((url) => (
              <li key={url}>
                <a href={url} target="_blank" rel="noreferrer">
                  {url}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}

      <details className="requirements">
        <summary className="requirements-toggle">
          View requirements &amp; how to qualify
        </summary>

        <div className="requirements-body">
          {requirements.specialConditions && (
            <section className="requirements-section">
              <h4 className="requirements-heading tender-specific">
                Special conditions for this tender
              </h4>
              <p className="requirements-note">
                Set by the buyer. Not meeting these makes your bid non-responsive.
              </p>
              <p className="requirements-special">{requirements.specialConditions}</p>
            </section>
          )}

          {requirements.briefing && (
            <section className="requirements-section">
              <h4 className="requirements-heading tender-specific">
                Briefing session{requirements.briefing.compulsory ? " (compulsory)" : ""}
              </h4>
              <p className="requirements-note">
                {requirements.briefing.compulsory
                  ? "Attendance is mandatory — miss it and your bid will be disqualified."
                  : "Attendance is optional but recommended."}
                {requirements.briefing.venue ? ` Venue: ${requirements.briefing.venue}.` : ""}
                {tender.briefing_date
                  ? ` Date: ${formatDateTime(tender.briefing_date)}.`
                  : ""}
              </p>
            </section>
          )}

          <section className="requirements-section">
            <h4 className="requirements-heading">
              Documents you&apos;ll typically need
              {requirements.mainCategory && CATEGORY_LABELS[requirements.mainCategory.toLowerCase()]
                ? ` (${CATEGORY_LABELS[requirements.mainCategory.toLowerCase()]})`
                : ""}
            </h4>
            <ul className="requirements-list">
              {requirements.standardDocuments.map((doc) => (
                <li key={doc}>{doc}</li>
              ))}
            </ul>
          </section>

          <section className="requirements-section">
            <h4 className="requirements-heading">Standard SBD forms</h4>
            <ul className="requirements-list">
              {requirements.sbdForms.map((form) => (
                <li key={form.code}>
                  <strong>{form.code}</strong> — {form.title}
                </li>
              ))}
            </ul>
          </section>

          <section className="requirements-section">
            <h4 className="requirements-heading">What can disqualify you</h4>
            <ul className="requirements-list disqualifiers">
              {requirements.disqualifiers.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <p className="requirements-disclaimer">
            The special conditions and briefing details above come straight from the tender
            feed. The document, SBD-form and disqualification lists are general guidance based
            on standard South African government procurement rules — always confirm the exact
            requirements in the official tender document before submitting.
          </p>
        </div>
      </details>

      {matches && matches.length > 0 && (
        <>
          <h3 className="section-heading">Matches</h3>
          {matches.map((match) => (
            <article className="match-card" key={match.id}>
              <div className="detail-match-header">
                <div>
                  <p className="match-meta">
                    <span className="meta-item">Profile: {match.matching_profiles?.name ?? "Unknown"}</span>
                  </p>
                </div>
                <div className="badges">
                  <span className="badge score">Score {match.match_score ?? 0}</span>
                  <span className={`badge status-${match.status}`}>{match.status}</span>
                </div>
              </div>

              {match.status !== "dismissed" && (
                <div className="match-actions">
                  {match.status !== "saved" && (
                    <form action={updateMatchStatus.bind(null, match.id, "saved")}>
                      <button type="submit">Save</button>
                    </form>
                  )}
                  {match.status !== "applied" && (
                    <form action={updateMatchStatus.bind(null, match.id, "applied")}>
                      <button type="submit">Mark applied</button>
                    </form>
                  )}
                  <form action={updateMatchStatus.bind(null, match.id, "dismissed")} className="dismiss-button">
                    <button type="submit">Dismiss</button>
                  </form>
                </div>
              )}
            </article>
          ))}
        </>
      )}
    </main>
  );
}
