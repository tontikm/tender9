import { getSupabaseAuthClient, getCurrentUser } from "@/lib/supabase-auth";
import { updateMatchStatus } from "../actions";
import { IconBuilding, IconTag, IconMapPin, IconCalendar } from "../components/icons";
import { formatDate, formatValue } from "@/lib/format";
import { SA_PROVINCES } from "@/lib/provinces";
import { ProvinceSelect } from "./ProvinceSelect";

export const dynamic = "force-dynamic";

const STATUS_FILTERS = ["all", "new", "saved", "applied", "dismissed"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const SORT_OPTIONS = ["score", "closing"] as const;
type SortOption = (typeof SORT_OPTIONS)[number];
const SORT_LABELS: Record<SortOption, string> = {
  score: "Best match",
  closing: "Closing soonest",
};

const PROVINCE_FILTERS = ["all", ...SA_PROVINCES] as const;
type ProvinceFilter = (typeof PROVINCE_FILTERS)[number];

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
}

interface MatchRow {
  id: string;
  match_score: number | null;
  status: string;
  viewed_at: string | null;
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
  sortOption,
  provinceFilter,
}: {
  page: number;
  totalPages: number;
  statusFilter: StatusFilter;
  sortOption: SortOption;
  provinceFilter: ProvinceFilter;
}) {
  if (totalPages <= 1) return null;

  const hrefFor = (p: number) => {
    const qs = new URLSearchParams();
    if (statusFilter !== "all") qs.set("status", statusFilter);
    if (sortOption !== "score") qs.set("sort", sortOption);
    if (provinceFilter !== "all") qs.set("province", provinceFilter);
    if (p > 1) qs.set("page", String(p));
    const query = qs.toString();
    return query ? `/dashboard?${query}` : "/dashboard";
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
        Ingestion started {new Date(run.started_at).toLocaleString("en-ZA")}. Still running.
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
      Last ingestion succeeded {run.finished_at ? new Date(run.finished_at).toLocaleString("en-ZA") : "—"}:{" "}
      {run.records_fetched ?? 0} fetched, {run.records_new ?? 0} new, {run.records_updated ?? 0} updated.
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string; sort?: string; province?: string }>;
}) {
  const params = await searchParams;
  const statusFilter: StatusFilter = STATUS_FILTERS.includes(params.status as StatusFilter)
    ? (params.status as StatusFilter)
    : "all";
  const sortOption: SortOption = SORT_OPTIONS.includes(params.sort as SortOption)
    ? (params.sort as SortOption)
    : "score";
  const provinceFilter: ProvinceFilter = PROVINCE_FILTERS.includes(params.province as ProvinceFilter)
    ? (params.province as ProvinceFilter)
    : "all";
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  const hrefFor = (overrides: { status?: StatusFilter; sort?: SortOption; province?: ProvinceFilter }) => {
    const nextStatus = overrides.status ?? statusFilter;
    const nextSort = overrides.sort ?? sortOption;
    const nextProvince = overrides.province ?? provinceFilter;
    const qs = new URLSearchParams();
    if (nextStatus !== "all") qs.set("status", nextStatus);
    if (nextSort !== "score") qs.set("sort", nextSort);
    if (nextProvince !== "all") qs.set("province", nextProvince);
    const query = qs.toString();
    return query ? `/dashboard?${query}` : "/dashboard";
  };

  // Carries pagination too, so "back to dashboard" from a tender returns to
  // the exact page the user was on, not just the filters.
  const currentDashboardUrl = (() => {
    const qs = new URLSearchParams();
    if (statusFilter !== "all") qs.set("status", statusFilter);
    if (sortOption !== "score") qs.set("sort", sortOption);
    if (provinceFilter !== "all") qs.set("province", provinceFilter);
    if (page > 1) qs.set("page", String(page));
    const query = qs.toString();
    return query ? `/dashboard?${query}` : "/dashboard";
  })();

  const user = await getCurrentUser();
  const userId = user?.id ?? "";
  const supabase = await getSupabaseAuthClient();

  // PostgREST can't express "status IN (saved, applied) OR tenders.closing_date
  // >= now" as a single query (mixing a parent-table and embedded-table
  // condition in one OR isn't supported), so fetch the status-filtered set
  // and apply the closing-date rule + pagination in application code. Match
  // counts per user are in the hundreds, not thousands, so this is fine.
  const nowIso = new Date().toISOString();
  const isExpiredAndUnreviewed = (status: string, closingDate: string | null | undefined) => {
    if (status !== "new") return false; // saved/applied/dismissed keep full history regardless of expiry
    return !!closingDate && closingDate < nowIso;
  };

  // Run both reads in parallel — the ingestion-run banner and the match list
  // are independent, so there's no reason to pay two serial round-trips.
  // Matches select only the columns the dashboard renders — NOT tenders(*),
  // which would drag in the large raw_payload JSON per row. All
  // filtering/sorting/paging/counting is then done in app code.
  const [{ data: lastRun }, { data: allMatches, error }] = await Promise.all([
    supabase
      .from("ingestion_runs")
      .select("status, started_at, finished_at, records_fetched, records_new, records_updated, error_message")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("tender_matches")
      .select(
        "id, match_score, status, viewed_at, tenders!inner(id, title, buyer_name, category, province, value_estimate, currency, closing_date), matching_profiles(name)"
      )
      .eq("user_id", userId)
      .order("match_score", { ascending: false })
      .returns<MatchRow[]>(),
  ]);

  const all = allMatches ?? [];

  // Stats-bar counts: every non-expired match grouped by status.
  const statusCounts = all
    .filter((match) => !isExpiredAndUnreviewed(match.status, match.tenders?.closing_date))
    .reduce<Record<string, number>>((acc, match) => {
      acc[match.status] = (acc[match.status] ?? 0) + 1;
      return acc;
    }, {});

  // Visible list: apply the status tab, province filter, and the
  // closing-date expiry rule.
  const visibleMatches = all.filter((match) => {
    if (isExpiredAndUnreviewed(match.status, match.tenders?.closing_date)) return false;
    if (provinceFilter !== "all" && match.tenders?.province !== provinceFilter) return false;
    return statusFilter === "all" ? match.status !== "dismissed" : match.status === statusFilter;
  });

  if (sortOption === "closing") {
    visibleMatches.sort((a, b) => {
      const aDate = a.tenders?.closing_date;
      const bDate = b.tenders?.closing_date;
      if (!aDate && !bDate) return 0;
      if (!aDate) return 1;
      if (!bDate) return -1;
      return aDate.localeCompare(bDate);
    });
  }

  const totalPages = Math.max(1, Math.ceil(visibleMatches.length / PAGE_SIZE));
  const matches = visibleMatches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <main>
      <h1>Matched tenders</h1>
      <p className="subtitle">Tenders from the eTenders OCDS feed, scored against your matching profiles.</p>

      <StatsBar counts={statusCounts} />

      <RunBanner run={lastRun as IngestionRun | null} />

      <div className="filter-bar">
        <nav className="filters">
          {STATUS_FILTERS.map((filter) => (
            <a
              key={filter}
              href={hrefFor({ status: filter })}
              className={filter === statusFilter ? "active" : ""}
            >
              {filter[0].toUpperCase() + filter.slice(1)}
            </a>
          ))}
        </nav>

        <nav className="filters">
          {SORT_OPTIONS.map((option) => (
            <a
              key={option}
              href={hrefFor({ sort: option })}
              className={option === sortOption ? "active" : ""}
            >
              {SORT_LABELS[option]}
            </a>
          ))}
        </nav>

        <ProvinceSelect
          current={provinceFilter}
          options={PROVINCE_FILTERS.map((p) => ({
            value: p,
            label: p === "all" ? "All provinces" : p,
            href: hrefFor({ province: p }),
          }))}
        />
      </div>

      {error && <p className="empty-state">Failed to load matches: {error.message}</p>}

      {!error && (!matches || matches.length === 0) && (
        <p className="empty-state">No matches in this view yet.</p>
      )}

      {matches?.map((match) => {
        const tender = match.tenders;
        if (!tender) return null;

        return (
          <article className={`match-card${match.viewed_at ? " viewed" : ""}`} key={match.id}>
            <div className="match-card-header">
              <div>
                <h3 className="match-title">
                  <a href={`/tenders/${tender.id}?from=${encodeURIComponent(currentDashboardUrl)}`}>
                    {tender.title}
                  </a>
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
                  {tender.value_estimate != null && tender.value_estimate > 0 && (
                    <span className="meta-item">
                      {formatValue(tender.value_estimate, tender.currency)}
                    </span>
                  )}
                  <span className="meta-item">
                    <IconCalendar className="meta-icon" />
                    Closes {formatDate(tender.closing_date)}
                  </span>
                </div>
              </div>
              <div className="badges">
                {match.viewed_at && <span className="badge viewed">Viewed</span>}
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

      <Pagination
        page={page}
        totalPages={totalPages}
        statusFilter={statusFilter}
        sortOption={sortOption}
        provinceFilter={provinceFilter}
      />
    </main>
  );
}
