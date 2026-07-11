import { notFound } from "next/navigation";
import { getSupabaseAuthClient, getCurrentUser } from "@/lib/supabase-auth";
import { normaliseChecklist } from "@/lib/bid-workspace";
import { formatDate } from "@/lib/format";
import { BidWorkspace } from "./BidWorkspace";

export const dynamic = "force-dynamic";

interface TenderRow {
  id: string;
  title: string;
  buyer_name: string | null;
  closing_date: string | null;
}

interface WorkspaceRow {
  checklist: unknown;
  notes: string | null;
}

// Days until closing, computed server-side to avoid a hydration mismatch.
function closingInfo(closingDate: string | null): { label: string; urgent: boolean } | null {
  if (!closingDate) return null;
  const closing = new Date(closingDate);
  const now = new Date();
  const days = Math.ceil((closing.getTime() - now.getTime()) / 86_400_000);
  if (days < 0) return { label: "Closed", urgent: true };
  if (days === 0) return { label: "Closes today", urgent: true };
  if (days === 1) return { label: "Closes tomorrow", urgent: true };
  return { label: `Closes in ${days} days`, urgent: days <= 7 };
}

export default async function WorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const supabase = await getSupabaseAuthClient();

  const [{ data: tender }, { data: workspace }] = await Promise.all([
    supabase
      .from("tenders")
      .select("id, title, buyer_name, closing_date")
      .eq("id", id)
      .maybeSingle<TenderRow>(),
    supabase
      .from("bid_workspaces")
      .select("checklist, notes")
      .eq("tender_id", id)
      .eq("user_id", user?.id ?? "")
      .maybeSingle<WorkspaceRow>(),
  ]);

  if (!tender) notFound();

  const closing = closingInfo(tender.closing_date);

  return (
    <main>
      <nav className="page-nav">
        <a href={`/tenders/${id}`}>&larr; Back to tender</a>
        <a href={`/fill?tender=${id}`} className="page-nav-cta">
          Fill documents
        </a>
      </nav>

      <h1>Bid workspace</h1>
      <p className="subtitle">
        {tender.title}
        {tender.buyer_name ? ` — ${tender.buyer_name}` : ""}
      </p>

      {closing && (
        <p className={`workspace-deadline ${closing.urgent ? "urgent" : ""}`}>
          {closing.label}
          {tender.closing_date ? ` · ${formatDate(tender.closing_date)}` : ""}
        </p>
      )}

      <BidWorkspace
        tenderId={id}
        initialChecklist={normaliseChecklist(workspace?.checklist)}
        initialNotes={workspace?.notes ?? ""}
      />
    </main>
  );
}
