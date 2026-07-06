/**
 * eTenders OCDS API integration.
 *
 * IMPORTANT — before this works, verify the real endpoint path and query
 * parameters against the live Swagger UI:
 *   https://ocds-api.etenders.gov.za/swagger/index.html
 *
 * The values below (OCDS_RELEASES_PATH, param names) are best-guess
 * placeholders based on typical OCDS API conventions, not confirmed against
 * this specific API. Open the Swagger UI, find the "releases" (or similar)
 * endpoint, and update OCDS_RELEASES_PATH and the query param names in
 * fetchOcdsReleases() to match exactly what you see there.
 */

const OCDS_BASE_URL = "https://ocds-api.etenders.gov.za";

// TODO: verify this path against the live swagger.json
const OCDS_RELEASES_PATH = "/api/OCDSReleases";

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
 * Fetches releases from the OCDS API.
 * `sinceDate` should be an ISO date string — pass the last successful
 * ingestion run's timestamp to avoid re-fetching everything each time,
 * once you've confirmed the API supports a date filter param.
 */
export async function fetchOcdsReleases(sinceDate?: string): Promise<unknown[]> {
  const params = new URLSearchParams();
  if (sinceDate) {
    // TODO: confirm the actual param name (dateFrom / DateFrom / since / etc.)
    params.set("dateFrom", sinceDate);
  }

  const url = `${OCDS_BASE_URL}${OCDS_RELEASES_PATH}${
    params.toString() ? `?${params.toString()}` : ""
  }`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`OCDS API request failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();

  // OCDS APIs typically wrap releases in a top-level "releases" array —
  // adjust this if the actual response shape differs.
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.releases)) return data.releases;

  throw new Error(
    "Unexpected OCDS API response shape — inspect the raw response and update fetchOcdsReleases()"
  );
}

/**
 * Maps a single OCDS release into our tenders table shape.
 * OCDS field paths follow the standard schema: https://standard.open-contracting.org/latest/en/schema/reference/
 * Adjust field paths here if the SA implementation deviates from standard OCDS.
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
    category: tender.mainProcurementCategory ?? null,
    province: null, // TODO: confirm whether province is available in the SA extension fields
    value_estimate: tender.value?.amount ?? null,
    currency: tender.value?.currency ?? "ZAR",
    status: tender.status ?? null,
    closing_date: tender.tenderPeriod?.endDate ?? null,
    briefing_date: null, // TODO: map if a briefing/clarification meeting field exists
    published_date: release.date ?? null,
    document_urls: (tender.documents ?? [])
      .map((d: any) => d.url)
      .filter((url: unknown): url is string => typeof url === "string"),
    raw_payload: release,
  };
}
