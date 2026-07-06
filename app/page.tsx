import { getSupabaseServerClient } from "@/lib/supabase";
import { updateMatchStatus } from "./actions";

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

  return (
    <main>
      <h1>Tender9</h1>
      <p className="subtitle">Matched tenders from the eTenders OCDS feed.</p>

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
                  {tender.document_urls?.[0] ? (
                    <a href={tender.document_urls[0]} target="_blank" rel="noreferrer">
                      {tender.title}
                    </a>
                  ) : (
                    tender.title
                  )}
                </h3>
                <p className="match-meta">
                  <span>{tender.buyer_name ?? "Unknown buyer"}</span>
                  <span>{tender.category ?? "Uncategorized"}</span>
                  <span>{tender.province ?? "No province"}</span>
                  <span>{formatValue(tender.value_estimate, tender.currency)}</span>
                  <span>Closes {formatDate(tender.closing_date)}</span>
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
                <form action={updateMatchStatus.bind(null, match.id, "dismissed")}>
                  <button type="submit">Dismiss</button>
                </form>
              </div>
            )}
          </article>
        );
      })}
    </main>
  );
}
