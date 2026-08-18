import { getSupabaseAuthClient, getCurrentUser } from "@/lib/supabase-auth";
import { formatDate } from "@/lib/format";
import type { CompanyProfile } from "../company/CompanyForm";
import { RfqBuilder, type ExistingRfq } from "./RfqBuilder";
import { displayTitle } from "@/lib/tender-text";

export const dynamic = "force-dynamic";

interface TenderInfo {
  id: string;
  title: string;
  description: string | null;
  buyer_name: string | null;
}

interface RecentRfq {
  id: string;
  title: string;
  recipient_name: string | null;
  updated_at: string;
}

export default async function RfqPage({
  searchParams,
}: {
  searchParams: Promise<{ tender?: string; id?: string }>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const userId = user?.id ?? "";
  const supabase = await getSupabaseAuthClient();

  const [{ data: profile }, tenderResult, rfqResult] = await Promise.all([
    supabase.from("company_profiles").select("*").eq("user_id", userId).maybeSingle<CompanyProfile>(),
    params.tender
      ? supabase
          .from("tenders")
          .select("id, title, description, buyer_name")
          .eq("id", params.tender)
          .maybeSingle<TenderInfo>()
      : Promise.resolve({ data: null as TenderInfo | null }),
    params.id
      ? supabase
          .from("rfqs")
          .select("id, title, recipient_name, recipient_email, due_date, notes, items, tender_id")
          .eq("id", params.id)
          .eq("user_id", userId)
          .maybeSingle<ExistingRfq>()
      : Promise.resolve({ data: null as ExistingRfq | null }),
  ]);

  const tender = tenderResult.data;
  const existing = rfqResult.data;

  const { data: recent } = !params.id
    ? await supabase
        .from("rfqs")
        .select("id, title, recipient_name, updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(8)
        .returns<RecentRfq[]>()
    : { data: null };

  return (
    <main className="rfq-main">
      <h1>Request for quotation</h1>
      <p className="subtitle">
        Paste in what you need priced, and we&apos;ll turn it into a branded quotation request ready
        to send to suppliers.
      </p>

      {tender && !existing && (
        <p className="rfq-context">
          {/* displayTitle often ends in a period already (unlike a bare
              reference-code title) — strip it so it doesn't collide with
              the punctuation this sentence adds. */}
          For <strong>{displayTitle(tender, 100).replace(/\.+$/, "")}</strong>
          {tender.buyer_name ? ` · ${tender.buyer_name}` : ""}.{" "}
          <a href={`/tenders/${tender.id}/workspace`}>Back to bid workspace</a>
        </p>
      )}

      {!existing && recent && recent.length > 0 && (
        <details className="rfq-recent">
          <summary>Continue a recent request ({recent.length})</summary>
          <ul>
            {recent.map((r) => (
              <li key={r.id}>
                <a href={`/rfq?id=${r.id}`}>
                  {r.title}
                  {r.recipient_name ? ` · ${r.recipient_name}` : ""}
                </a>
                <span className="rfq-recent-meta">Updated {formatDate(r.updated_at)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <RfqBuilder
        company={profile ?? null}
        tenderId={params.tender ?? existing?.tender_id ?? null}
        existing={existing ?? null}
      />
    </main>
  );
}
