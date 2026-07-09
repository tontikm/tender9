/**
 * eTenders OCDS API integration.
 *
 * Endpoint, params, and field paths confirmed against:
 *   https://ocds-api.etenders.gov.za/swagger/v1/swagger.json
 */

const OCDS_BASE_URL = "https://ocds-api.etenders.gov.za";

const OCDS_RELEASES_PATH = "/api/OCDSReleases";

// dateFrom/dateTo are both required by the API (a bare request 400s with
// "dateFrom and dateTo fields are required"), and results are paginated via
// a `links.next` URL in the response. The swagger docs suggest requesting
// large page sizes (up to 20000), but in practice PageSize values above a
// few hundred make the API take 40s+ per page — stick to its own default.
//
// The API also has a server-side pagination bug: within a single query, each
// subsequent page gets linearly slower (page 1 ~3s, page 18 ~32s) and
// `links.next` keeps appearing well past where the release count should be
// exhausted. To stay reliable we fetch the requested range in small date
// WINDOWS, each paginated from page 1 — so no single sequence ever gets deep
// enough to slow to a crawl, and no window holds enough releases to hit the
// per-window page cap and silently truncate. This is what keeps ingestion
// from dropping tenders on wider catch-up runs.
export const DEFAULT_LOOKBACK_DAYS = 3;
const WINDOW_DAYS = 3;
const PAGE_SIZE = 100;
const MAX_PAGES_PER_WINDOW = 15;

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDay(d);
}

async function fetchWindow(dateFrom: string, dateTo: string): Promise<unknown[]> {
  const releases: unknown[] = [];
  let url = `${OCDS_BASE_URL}${OCDS_RELEASES_PATH}?${new URLSearchParams({
    dateFrom,
    dateTo,
    PageNumber: "1",
    PageSize: String(PAGE_SIZE),
  })}`;

  for (let page = 0; page < MAX_PAGES_PER_WINDOW && url; page++) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });

    if (!res.ok) {
      throw new Error(`OCDS API request failed: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();

    if (!Array.isArray(data?.releases)) {
      throw new Error(
        "Unexpected OCDS API response shape — inspect the raw response and update fetchOcdsReleases()"
      );
    }

    releases.push(...data.releases);

    const nextUrl: string | undefined = data?.links?.next;
    url = nextUrl && data.releases.length > 0 ? nextUrl : "";
  }

  return releases;
}

export interface NormalizedTender {
  source: string;
  external_id: string;
  title: string;
  description: string | null;
  buyer_name: string | null;
  category: string | null;
  province: string | null;
  value_estimate: number | null;
  currency: string;
  status: string | null;
  closing_date: string | null;
  briefing_date: string | null;
  published_date: string | null;
  document_urls: string[];
  raw_payload: unknown;
}

/**
 * Fetches OCDS releases published in [dateFrom, dateTo] (inclusive, YYYY-MM-DD),
 * walking the range in small date windows so pagination stays fast and no
 * window is large enough to be truncated by the per-window page cap. Duplicate
 * releases across window edges are harmless — the caller upserts by ocid.
 */
export async function fetchOcdsReleases(dateFrom: string, dateTo: string): Promise<unknown[]> {
  const all: unknown[] = [];
  let windowStart = dateFrom;

  while (windowStart <= dateTo) {
    let windowEnd = addDays(windowStart, WINDOW_DAYS - 1);
    if (windowEnd > dateTo) windowEnd = dateTo;

    all.push(...(await fetchWindow(windowStart, windowEnd)));

    windowStart = addDays(windowEnd, 1);
  }

  return all;
}

// The API serializes an absent .NET DateTime as "0001-01-01T00:00:00" instead
// of null (seen on briefingSession.date when isSession is false) — filter it out.
function isSentinelDate(value: unknown): boolean {
  return typeof value === "string" && value.startsWith("0001-01-01");
}

/**
 * Maps a single OCDS release into our tenders table shape.
 * Field paths confirmed against the eTenders swagger ReleasePackage/Release/Tender schemas
 * (SA implementation adds category/province directly on tender, plus a briefingSession object).
 */
export function normalizeRelease(release: any): NormalizedTender | null {
  const tender = release?.tender;
  if (!tender) return null;

  const ocid: string | undefined = release.ocid;
  if (!ocid) return null;

  return {
    source: "etenders_ocds",
    external_id: ocid,
    title: tender.title ?? "(no title)",
    description: tender.description ?? null,
    buyer_name: release.buyer?.name ?? release.parties?.[0]?.name ?? null,
    category: tender.category ?? tender.mainProcurementCategory ?? null,
    province: tender.province ?? null,
    value_estimate: tender.value?.amount ?? null,
    currency: tender.value?.currency ?? "ZAR",
    status: tender.status ?? null,
    closing_date: tender.tenderPeriod?.endDate ?? null,
    briefing_date:
      tender.briefingSession?.isSession && !isSentinelDate(tender.briefingSession?.date)
        ? tender.briefingSession.date
        : null,
    published_date: release.date ?? null,
    document_urls: (tender.documents ?? [])
      .map((d: any) => d.url)
      .filter((url: unknown): url is string => typeof url === "string"),
    raw_payload: release,
  };
}
