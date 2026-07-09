import { getSupabaseAuthClient, getCurrentUser } from "@/lib/supabase-auth";
import { buildBidPack, type SbdCompany, type SbdTender } from "@/lib/sbd";
import { renderBidPackPdf } from "@/lib/sbd-pdf";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EMPTY_COMPANY: SbdCompany = {
  legal_name: null,
  trading_name: null,
  registration_number: null,
  vat_number: null,
  csd_number: null,
  tax_compliance_pin: null,
  bbbee_level: null,
  bbbee_expiry: null,
  cidb_grade: null,
  cidb_expiry: null,
  physical_address: null,
  contact_email: null,
  contact_phone: null,
  bank_name: null,
  bank_account_holder: null,
  bank_account_number: null,
  bank_branch_code: null,
  signatory_name: null,
  signatory_capacity: null,
};

function safeFilename(reference: string): string {
  const base = reference.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "tender";
  return `Bid-pack-${base}.pdf`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const supabase = await getSupabaseAuthClient();
  const [{ data: tender }, { data: company }] = await Promise.all([
    supabase
      .from("tenders")
      .select("title, description, buyer_name, category, province, closing_date")
      .eq("id", id)
      .maybeSingle<SbdTender>(),
    supabase
      .from("company_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle<SbdCompany>(),
  ]);

  if (!tender) return new Response("Tender not found", { status: 404 });

  const pack = buildBidPack(company ?? EMPTY_COMPANY, tender);
  const pdf = await renderBidPackPdf(pack);

  return new Response(pdf as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeFilename(tender.title)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
