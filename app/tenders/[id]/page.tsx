import { notFound } from "next/navigation";
import { getSupabaseAuthClient, getCurrentUser } from "@/lib/supabase-auth";
import { updateMatchStatus, dismissMatchAndReturn } from "../../actions";
import { IconBuilding, IconTag, IconMapPin, IconCalendar } from "../../components/icons";
import { formatDate, formatDateTime, formatValue } from "@/lib/format";
import { extractRequirements } from "@/lib/requirements";
import { describeDocuments } from "@/lib/tender-docs";
import { TenderDocuments } from "./TenderDocuments";

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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  const user = await getCurrentUser();
  const supabase = await getSupabaseAuthClient();

  // Wherever the user actually came from (dashboard, browse, or my
  // workspace), so "back"/"dismiss" return them there instead of always
  // landing on the dashboard.
  const backHref = from && from.startsWith("/") && !from.startsWith("//") ? from : "/dashboard";
  const backLabel = from?.startsWith("/browse")
    ? "Back to browse"
    : from?.startsWith("/workspace")
      ? "Back to my workspace"
      : "Back to matched tenders";

  const { data: tender } = await supabase
    .from("tenders")
    .select(
      "id, title, description, buyer_name, category, province, value_estimate, currency, status, closing_date, briefing_date, published_date, document_urls, raw_payload"
    )
    .eq("id", id)
    .maybeSingle<Tender>();

  if (!tender) notFound();

  const requirements = extractRequirements(tender.raw_payload);

  // Which of this tender's documents does the user have an in-progress fill for?
  const { data: savedFillRows } = await supabase
    .from("document_fills")
    .select("doc_key")
    .eq("user_id", user?.id ?? "")
    .eq("tender_id", id)
    .returns<{ doc_key: string }[]>();
  const savedDocIndexes = (savedFillRows ?? [])
    .map((r) => Number.parseInt(r.doc_key.split(":")[2] ?? "", 10))
    .filter((n) => Number.isInteger(n));

  const { data: matches } = await supabase
    .from("tender_matches")
    .select("id, match_score, status, matching_profiles(name)")
    .eq("tender_id", id)
    .eq("user_id", user?.id ?? "")
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
        <a href={backHref}>&larr; {backLabel}</a>
        <span className="page-nav-actions">
          <a href={`/tenders/${tender.id}/workspace`} className="page-nav-cta secondary">
            Bid workspace
          </a>
          <a href={`/fill?tender=${tender.id}`} className="page-nav-cta">
            Fill documents
          </a>
        </span>
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
        {tender.value_estimate != null && tender.value_estimate > 0 && (
          <span className="meta-item">{formatValue(tender.value_estimate, tender.currency)}</span>
        )}
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

      {tender.briefing_date && (
        <div className={`briefing-reminder ${requirements.briefing?.compulsory ? "compulsory" : ""}`}>
          <IconCalendar className="meta-icon" />
          <span>
            Briefing session {formatDateTime(tender.briefing_date)}
            {requirements.briefing?.compulsory ? " (compulsory)" : ""}
          </span>
          <a href={`/tenders/${tender.id}/calendar`} className="briefing-calendar-link">
            Add reminder to calendar
          </a>
        </div>
      )}

      {tender.description && (
        <>
          <h3 className="section-heading">Description</h3>
          <p className="detail-description">{tender.description}</p>
        </>
      )}

      {tender.document_urls && tender.document_urls.length > 0 && (
        <>
          <h3 className="section-heading">Documents</h3>
          <TenderDocuments
            tenderId={tender.id}
            documents={describeDocuments(tender.document_urls)}
            savedDocIndexes={savedDocIndexes}
          />
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
                  ? "Attendance is mandatory. Miss it and your bid will be disqualified."
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
                  <strong>{form.code}</strong>: {form.title}
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
            on standard South African government procurement rules, so always confirm the exact
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
                    <span className="meta-item">
                      {match.matching_profiles?.name ? `Profile: ${match.matching_profiles.name}` : "Manually saved"}
                    </span>
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
                  <form
                    action={dismissMatchAndReturn.bind(null, match.id, backHref)}
                    className="dismiss-button"
                  >
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
