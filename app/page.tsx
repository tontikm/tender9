import { getSupabaseServerClient } from "@/lib/supabase";
import { updateMatchStatus, generateDraft } from "./actions";
import { IconBuilding, IconTag, IconMapPin, IconCalendar, IconCoin } from "./components/icons";

export const dynamic = "force-dynamic";

const STATUS_FILTERS = ["all", "new", "saved", "applied", "dismissed"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

interface TenderRow {
  id: string;
  title: string;
  buyer_name: string | null;
  category: string | null;
  province: string | null;
  value_estimate: number | null;
  currency: string | null;
  closing_date: string | null;
  document_urls: string[] | null;
}

interface DraftRow {
  tender_id: string;
  content: string;
  created_at: string;
}

interface MatchRow {
  id: string;
  match_score: number | null;
  status: string;
  tenders: TenderRow | null;
  matching_profiles: { name: string } | null;
}

interface IngestionRun {
  status: string;
  started_at: string;
  finished_at: string | null;
  records_fetched: number | null;
  records_new: number | null;
  records_updated: number | null;
  error_message: string | null;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatValue(amount: number | null, currency: string | null): string {
  if (amount == null || amount === 0) return "—";
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: currency ?? "ZAR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function StatsBar({ counts }: { counts: Record<string, number> }) {
  const stats = [
    { label: "New", value: counts.new ?? 0 },
    { label: "Saved", value: counts.saved ?? 0 },
    { label: "Applied", value: counts.applied ?? 0 },
  ];

  return (
    <div className="stats-bar">
      {stats.map((stat) => (
        <div className="stat-card" key={stat.label}>
          <span className="stat-value">{stat.value}</span>
          <span className="stat-label">{stat.label}</span>
        </div>
      ))}
    </div>
  );
}

function RunBanner({ run }: { run: IngestionRun | null }) {
  if (!run) {
    return <div className="run-banner none">No ingestion runs yet.</div>;
  }

  if (run.status === "running") {
    return (
      <div className="run-banner running">
        Ingestion started {new Date(run.started_at).toLocaleString("en-ZA")} — still running.
      </div>
    );
  }

  if (run.status === "failed") {
    return (
      <div className="run-banner failed">
        Last ingestion failed at {run.finished_at ? new Date(run.finished_at).toLocaleString("en-ZA") : "—"}
        {run.error_message ? `: ${run.error_message}` : ""}
      </div>
    );
  }

  return (
    <div className="run-banner success">
      Last ingestion succeeded {run.finished_at ? new Date(run.finished_at).toLocaleString("en-ZA") : "—"} —{" "}
      {run.records_fetched ?? 0} fetched, {run.records_new ?? 0} new, {run.records_updated ?? 0} updated.
    </div>
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const statusFilter: StatusFilter = STATUS_FILTERS.includes(params.status as StatusFilter)
    ? (params.status as StatusFilter)
    : "all";

  const supabase = getSupabaseServerClient();

  const { data: lastRun } = await supabase
    .from("ingestion_runs")
    .select("status, started_at, finished_at, records_fetched, records_new, records_updated, error_message")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let query = supabase
    .from("tender_matches")
    .select("id, match_score, status, tenders(*), matching_profiles(name)")
    .order("match_score", { ascending: false });

  if (statusFilter === "all") {
    query = query.neq("status", "dismissed");
  } else {
    query = query.eq("status", statusFilter);
  }

  const { data: matches, error } = await query.returns<MatchRow[]>();

  const { data: drafts } = await supabase
    .from("tender_drafts")
    .select("tender_id, content, created_at")
    .returns<DraftRow[]>();
  const draftsByTenderId = new Map((drafts ?? []).map((d) => [d.tender_id, d]));

  const { data: allStatuses } = await supabase.from("tender_matches").select("status");
  const statusCounts = (allStatuses ?? []).reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <main>
      <h1>Matched tenders</h1>
      <p className="subtitle">Tenders from the eTenders OCDS feed, scored against your matching profiles.</p>

      <StatsBar counts={statusCounts} />

      <RunBanner run={lastRun as IngestionRun | null} />

      <nav className="filters">
        {STATUS_FILTERS.map((filter) => (
          <a
            key={filter}
            href={filter === "all" ? "/" : `/?status=${filter}`}
            className={filter === statusFilter ? "active" : ""}
          >
            {filter[0].toUpperCase() + filter.slice(1)}
          </a>
        ))}
      </nav>

      {error && <p className="empty-state">Failed to load matches: {error.message}</p>}

      {!error && (!matches || matches.length === 0) && (
        <p className="empty-state">No matches in this view yet.</p>
      )}

      {matches?.map((match) => {
        const tender = match.tenders;
        if (!tender) return null;
        const draft = draftsByTenderId.get(tender.id);

        return (
          <article className="match-card" key={match.id}>
            <div className="match-card-header">
              <div>
                <h3 className="match-title">
                  {tender.document_urls?.[0] ? (
                    <a href={tender.document_urls[0]} target="_blank" rel="noreferrer">
                      {tender.title}
                    </a>
                  ) : (
                    tender.title
                  )}
                </h3>
                <div className="match-meta">
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
                  <span className="meta-item">
                    <IconCalendar className="meta-icon" />
                    Closes {formatDate(tender.closing_date)}
                  </span>
                </div>
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
                {match.status === "saved" && (
                  <form action={generateDraft.bind(null, tender.id)} className="draft-button">
                    <button type="submit">{draft ? "Regenerate draft" : "Draft response"}</button>
                  </form>
                )}
              </div>
            )}

            {match.status === "saved" && draft && (
              <div className="draft-block">
                <p className="draft-label">Draft response</p>
                <p className="draft-meta">
                  Drafted {new Date(draft.created_at).toLocaleString("en-ZA")}
                </p>
                <pre className="draft-content">{draft.content}</pre>
              </div>
            )}
          </article>
        );
      })}
    </main>
  );
}
