import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/supabase-auth";
import { updateMatchStatus } from "../../actions";
import { IconBuilding, IconTag, IconMapPin, IconCalendar, IconCoin } from "../../components/icons";
import { formatDate, formatDateTime, formatValue } from "@/lib/format";

export const dynamic = "force-dynamic";

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
  const supabase = getSupabaseServerClient();

  const { data: tender } = await supabase
    .from("tenders")
    .select(
      "id, title, description, buyer_name, category, province, value_estimate, currency, status, closing_date, briefing_date, published_date, document_urls"
    )
    .eq("id", id)
    .maybeSingle<Tender>();

  if (!tender) notFound();

  const { data: matches } = await supabase
    .from("tender_matches")
    .select("id, match_score, status, matching_profiles!inner(name, user_id)")
    .eq("tender_id", id)
    .eq("matching_profiles.user_id", user?.id ?? "")
    .order("match_score", { ascending: false })
    .returns<MatchRow[]>();

  return (
    <main>
      <nav className="page-nav">
        <a href="/">&larr; Back to matched tenders</a>
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
