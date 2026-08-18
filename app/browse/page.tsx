import type { Metadata } from "next";
import { getSupabaseAuthClient, getCurrentUser } from "@/lib/supabase-auth";
import { IconBuilding, IconTag, IconMapPin, IconCalendar } from "../components/icons";
import { formatDate, formatValue } from "@/lib/format";
import { SA_PROVINCES } from "@/lib/provinces";
import { saveTenderFromBrowse } from "../actions";
import { displayTitle } from "@/lib/tender-text";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Browse SA government tenders",
  description:
    "Search every open South African government tender from the National Treasury eTenders feed, by keyword, category, or province.",
};

const PAGE_SIZE = 20;

const BROWSE_PROVINCES = [...SA_PROVINCES, "National"];

interface TenderRow {
  id: string;
  title: string;
  description: string | null;
  buyer_name: string | null;
  category: string | null;
  province: string | null;
  value_estimate: number | null;
  currency: string | null;
  closing_date: string | null;
}

function Pagination({
  page,
  totalPages,
  q,
  province,
}: {
  page: number;
  totalPages: number;
  q: string;
  province: string;
}) {
  if (totalPages <= 1) return null;

  const hrefFor = (p: number) => {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (province) qs.set("province", province);
    if (p > 1) qs.set("page", String(p));
    const query = qs.toString();
    return query ? `/browse?${query}` : "/browse";
  };

  return (
    <nav className="pagination">
      <a href={hrefFor(page - 1)} aria-disabled={page <= 1} className={page <= 1 ? "disabled" : ""}>
        &larr; Previous
      </a>
      <span className="pagination-status">
        Page {page} of {totalPages}
      </span>
      <a href={hrefFor(page + 1)} aria-disabled={page >= totalPages} className={page >= totalPages ? "disabled" : ""}>
        Next &rarr;
      </a>
    </nav>
  );
}

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; province?: string; page?: string }>;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const province = params.province ?? "";
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  const supabase = await getSupabaseAuthClient();
  const nowIso = new Date().toISOString();

  let query = supabase
    .from("tenders")
    // "planned" uses the query planner's row estimate instead of a full
    // COUNT scan — roughly a second faster on ~1000 open tenders, and an
    // approximate total is fine for a browse pager.
    .select("id, title, description, buyer_name, category, province, value_estimate, currency, closing_date", {
      count: "planned",
    })
    .gte("closing_date", nowIso);

  if (q) {
    // Commas and parentheses delimit PostgREST's `or` syntax — strip them so a
    // user's search text can't break the filter, and % so it isn't a wildcard.
    const safe = q.replace(/[%,()]/g, " ").trim();
    if (safe) {
      query = query.or(
        `title.ilike.%${safe}%,buyer_name.ilike.%${safe}%,description.ilike.%${safe}%`
      );
    }
  }

  if (province) query = query.eq("province", province);

  const { data, count, error } = await query
    .order("closing_date", { ascending: true })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
    .returns<TenderRow[]>();

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const tenders = data ?? [];

  // So "back" from a tender detail page returns to this exact search/page.
  const currentBrowseUrl = (() => {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (province) qs.set("province", province);
    if (page > 1) qs.set("page", String(page));
    const query = qs.toString();
    return query ? `/browse?${query}` : "/browse";
  })();

  const user = await getCurrentUser();
  const tenderIds = tenders.map((t) => t.id);
  const { data: myMatches } =
    tenderIds.length && user
      ? await supabase
          .from("tender_matches")
          .select("tender_id, status")
          .eq("user_id", user.id)
          .in("tender_id", tenderIds)
          .returns<{ tender_id: string; status: string }[]>()
      : { data: [] as { tender_id: string; status: string }[] };
  const statusByTender = new Map((myMatches ?? []).map((m) => [m.tender_id, m.status]));

  return (
    <main>
      <h1>Browse tenders</h1>
      <p className="subtitle">
        {user
          ? "Search every open tender in the eTenders feed, not only the ones matched to your profiles."
          : "Every open South African government tender, straight from the National Treasury eTenders feed."}
      </p>

      <form className="browse-search" method="get" action="/browse">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Search title, buyer or description…"
          aria-label="Search tenders"
        />
        <select name="province" defaultValue={province} aria-label="Province">
          <option value="">All provinces</option>
          {BROWSE_PROVINCES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <button type="submit">Search</button>
      </form>

      {error && <p className="empty-state">Failed to load tenders: {error.message}</p>}

      {!error && (
        <p className="browse-count">
          {total} open tender{total === 1 ? "" : "s"}
          {q ? ` matching “${q}”` : ""}
          {province ? ` in ${province}` : ""}
        </p>
      )}

      {!error && tenders.length === 0 && (
        <p className="empty-state">No open tenders match this search.</p>
      )}

      {tenders.map((tender) => {
        const status = statusByTender.get(tender.id);
        return (
          <article className="match-card" key={tender.id}>
            <div className="match-card-header">
              <div>
                <h3 className="match-title">
                  <a href={`/tenders/${tender.id}?from=${encodeURIComponent(currentBrowseUrl)}`}>
                    {displayTitle(tender)}
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
                    <span className="meta-item">{formatValue(tender.value_estimate, tender.currency)}</span>
                  )}
                  <span className="meta-item">
                    <IconCalendar className="meta-icon" />
                    Closes {formatDate(tender.closing_date)}
                  </span>
                </div>
              </div>
              {status && status !== "new" && (
                <div className="badges">
                  <span className={`badge status-${status}`}>{status}</span>
                </div>
              )}
            </div>

            {status !== "saved" && status !== "applied" && (
              <div className="match-actions">
                {user ? (
                  <form action={saveTenderFromBrowse.bind(null, tender.id)}>
                    <button type="submit">Save</button>
                  </form>
                ) : (
                  <a href="/signup" className="hub-view-link">
                    Sign up to save this &rarr;
                  </a>
                )}
              </div>
            )}
          </article>
        );
      })}

      <Pagination page={page} totalPages={totalPages} q={q} province={province} />
    </main>
  );
}
