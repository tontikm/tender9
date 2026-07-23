import { getSupabaseAuthClient, getCurrentUser } from "@/lib/supabase-auth";
import { describeDocuments } from "@/lib/tender-docs";
import { formatDate } from "@/lib/format";
import { PdfFiller, type FillChip } from "./PdfFiller";

export const dynamic = "force-dynamic";

interface CompanyRow {
  legal_name: string | null;
  trading_name: string | null;
  registration_number: string | null;
  vat_number: string | null;
  csd_number: string | null;
  tax_compliance_pin: string | null;
  bbbee_level: string | null;
  physical_address: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  bank_name: string | null;
  bank_account_holder: string | null;
  bank_account_number: string | null;
  bank_branch_code: string | null;
  signatory_name: string | null;
  signatory_capacity: string | null;
}

// Order matters — most-used details first so they're at the top of the panel.
const CHIP_FIELDS: [keyof CompanyRow, string][] = [
  ["legal_name", "Registered name"],
  ["trading_name", "Trading name"],
  ["registration_number", "CIPC reg number"],
  ["csd_number", "CSD number"],
  ["vat_number", "VAT number"],
  ["tax_compliance_pin", "Tax PIN"],
  ["bbbee_level", "B-BBEE level"],
  ["signatory_name", "Signatory"],
  ["signatory_capacity", "Capacity"],
  ["contact_email", "Email"],
  ["contact_phone", "Phone"],
  ["physical_address", "Address"],
  ["bank_name", "Bank"],
  ["bank_account_holder", "Account holder"],
  ["bank_account_number", "Account number"],
  ["bank_branch_code", "Branch code"],
];

export default async function FillPage({
  searchParams,
}: {
  searchParams: Promise<{ tender?: string; doc?: string }>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const supabase = await getSupabaseAuthClient();
  const userId = user?.id ?? "";

  interface TenderRow {
    id: string;
    title: string;
    document_urls: string[] | null;
  }

  // Company details, the saved-fills list, and the tender's documents (when
  // opened from a tender) are all independent reads — fetch them together.
  const [{ data: company }, { data: savedRows }, { data: tender }] = await Promise.all([
    supabase.from("company_profiles").select("*").eq("user_id", userId).maybeSingle<CompanyRow>(),
    // Lightweight list of the user's saved in-progress fills (no bytes) so
    // they can resume any of them. Full data is fetched on demand via loadFill().
    supabase
      .from("document_fills")
      .select("doc_key, doc_name, tender_id, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .returns<{ doc_key: string; doc_name: string; tender_id: string | null; updated_at: string }[]>(),
    params.tender
      ? supabase.from("tenders").select("id, title, document_urls").eq("id", params.tender).maybeSingle<TenderRow>()
      : Promise.resolve({ data: null as TenderRow | null }),
  ]);

  const savedFills = (savedRows ?? []).map((r) => ({
    docKey: r.doc_key,
    docName: r.doc_name,
    updatedOn: formatDate(r.updated_at),
  }));

  const chips: FillChip[] = [];
  if (company) {
    for (const [key, label] of CHIP_FIELDS) {
      const value = company[key]?.toString().trim();
      if (value) chips.push({ label, value });
    }
  }
  chips.push({ label: "Today's date", value: formatDate(new Date().toISOString()) });

  // Turn the tender's PDF documents (via the same-origin proxy) into a
  // picker. `?doc=` chooses which loads first, otherwise the first PDF does.
  let tenderDocs: { name: string; url: string; key: string }[] = [];
  let initialKey: string | undefined;
  let tenderTitle: string | undefined;

  if (tender) {
    tenderTitle = tender.title;
    tenderDocs = describeDocuments(tender.document_urls)
      .filter((d) => d.isPdf)
      .map((d) => ({
        name: d.name,
        url: `/tenders/${tender.id}/document?i=${d.index}`,
        key: `tender:${tender.id}:${d.index}`,
      }));

    const docIndex = Number.parseInt(params.doc ?? "", 10);
    const wanted = Number.isInteger(docIndex)
      ? tenderDocs.find((d) => d.key === `tender:${tender.id}:${docIndex}`)
      : undefined;
    initialKey = wanted?.key ?? tenderDocs[0]?.key;
  }

  return (
    <main className="fill-main">
      <h1>Fill a document</h1>
      <p className="subtitle">
        {tenderTitle
          ? `Filling documents from ${tenderTitle}. `
          : "Open any PDF, a tender's official forms or your own, and place your saved details exactly where they belong. "}
        Click a detail, then click the spot on the document. Works on scanned documents too.
      </p>

      <PdfFiller
        chips={chips}
        tenderDocs={tenderDocs}
        initialKey={initialKey}
        savedFills={savedFills}
      />
    </main>
  );
}
