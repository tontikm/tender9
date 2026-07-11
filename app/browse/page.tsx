import { getSupabaseAuthClient } from "@/lib/supabase-auth";
import { IconBuilding, IconTag, IconMapPin, IconCalendar } from "../components/icons";
import { formatDate, formatValue } from "@/lib/format";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

const SA_PROVINCES = [
  "Eastern Cape",
  "Free State",
  "Gauteng",
  "KwaZulu-Natal",
  "Limpopo",
  "Mpumalanga",
  "North West",
  "Northern Cape",
  "Western Cape",
  "National",
];

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
    .select("id, title, buyer_name, category, province, value_estimate, currency, closing_date", {
      count: "exact",
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

  return (
    <main>
      <h1>Browse tenders</h1>
      <p className="subtitle">
        Search every open tender in the eTenders feed, not only the ones matched to your profiles.
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
          {SA_PROVINCES.map((p) => (
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

      {tenders.map((tender) => (
        <article className="match-card" key={tender.id}>
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
                {tender.value_estimate != null && tender.value_estimate > 0 && (
                  <span className="meta-item">{formatValue(tender.value_estimate, tender.currency)}</span>
                )}
                <span className="meta-item">
                  <IconCalendar className="meta-icon" />
                  Closes {formatDate(tender.closing_date)}
                </span>
              </div>
            </div>
          </div>
        </article>
      ))}

      <Pagination page={page} totalPages={totalPages} q={q} province={province} />
    </main>
  );
}
