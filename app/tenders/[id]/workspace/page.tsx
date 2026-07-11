import { notFound } from "next/navigation";
import { getSupabaseAuthClient, getCurrentUser } from "@/lib/supabase-auth";
import { normaliseChecklist, closingInfo } from "@/lib/bid-workspace";
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

  // In-progress fills the user has saved for this tender's documents.
  const { data: savedFills } = await supabase
    .from("document_fills")
    .select("doc_key, doc_name, updated_at")
    .eq("user_id", user?.id ?? "")
    .eq("tender_id", id)
    .order("updated_at", { ascending: false })
    .returns<{ doc_key: string; doc_name: string; updated_at: string }[]>();
  const startedDocs = (savedFills ?? []).map((f) => ({
    docName: f.doc_name,
    docIndex: Number.parseInt(f.doc_key.split(":")[2] ?? "", 10),
    updatedOn: formatDate(f.updated_at),
  }));

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

      {startedDocs.length > 0 && (
        <section className="workspace-group">
          <h3 className="workspace-group-heading">Documents you&apos;ve started</h3>
          <ul className="workspace-started">
            {startedDocs.map((d) => (
              <li key={d.docIndex}>
                <a
                  href={
                    Number.isInteger(d.docIndex)
                      ? `/fill?tender=${id}&doc=${d.docIndex}`
                      : `/fill?tender=${id}`
                  }
                  className="workspace-started-link"
                >
                  <span className="workspace-started-name">{d.docName}</span>
                  <span className="workspace-started-meta">Saved {d.updatedOn} · Resume</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <BidWorkspace
        tenderId={id}
        initialChecklist={normaliseChecklist(workspace?.checklist)}
        initialNotes={workspace?.notes ?? ""}
      />
    </main>
  );
}
