import { getSupabaseServerClient } from "@/lib/supabase";
import { updateMatchStatus } from "./actions";
import { IconBuilding, IconTag, IconMapPin, IconCalendar, IconCoin } from "./components/icons";
import { formatDate, formatValue } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUS_FILTERS = ["all", "new", "saved", "applied", "dismissed"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const PAGE_SIZE = 20;

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

function Pagination({
  page,
  totalPages,
  statusFilter,
}: {
  page: number;
  totalPages: number;
  statusFilter: StatusFilter;
}) {
  if (totalPages <= 1) return null;

  const hrefFor = (p: number) => {
    const qs = new URLSearchParams();
    if (statusFilter !== "all") qs.set("status", statusFilter);
    if (p > 1) qs.set("page", String(p));
    const query = qs.toString();
    return query ? `/?${query}` : "/";
  };

  return (
    <nav className="pagination">
      <a
        href={hrefFor(page - 1)}
        aria-disabled={page <= 1}
        className={page <= 1 ? "disabled" : ""}
      >
        &larr; Previous
      </a>
      <span className="pagination-status">
        Page {page} of {totalPages}
      </span>
      <a
        href={hrefFor(page + 1)}
        aria-disabled={page >= totalPages}
        className={page >= totalPages ? "disabled" : ""}
      >
        Next &rarr;
      </a>
    </nav>
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
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const params = await searchParams;
  const statusFilter: StatusFilter = STATUS_FILTERS.includes(params.status as StatusFilter)
    ? (params.status as StatusFilter)
    : "all";
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  const supabase = getSupabaseServerClient();

  const { data: lastRun } = await supabase
    .from("ingestion_runs")
    .select("status, started_at, finished_at, records_fetched, records_new, records_updated, error_message")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let query = supabase
    .from("tender_matches")
    .select("id, match_score, status, tenders(*), matching_profiles(name)", { count: "exact" })
    .order("match_score", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (statusFilter === "all") {
    query = query.neq("status", "dismissed");
  } else {
    query = query.eq("status", statusFilter);
  }

  const { data: matches, error, count } = await query.returns<MatchRow[]>();
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

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

        return (
          <article className="match-card" key={match.id}>
            <div className="match-card-header">
              <div>
                <h3 className="match-title">
                  <a href={`/tenders/${tender.id}`}>{tender.title}</a>
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
              </div>
            )}
          </article>
        );
      })}

      <Pagination page={page} totalPages={totalPages} statusFilter={statusFilter} />
    </main>
  );
}
