import type { getSupabaseAuthClient } from "@/lib/supabase-auth";
import { normaliseChecklist, checklistProgress, closingInfo, type ClosingInfo } from "@/lib/bid-workspace";

export interface WorkspaceTender {
  id: string;
  title: string;
  buyer_name: string | null;
  category: string | null;
  province: string | null;
  value_estimate: number | null;
  currency: string | null;
  closing_date: string | null;
}

export interface WorkspaceDoc {
  docKey: string;
  docName: string;
  docIndex: number | null;
  updatedAt: string;
}

export interface WorkspaceEntry {
  tender: WorkspaceTender;
  hasChecklist: boolean;
  progressDone: number;
  progressTotal: number;
  notes: string | null;
  docs: WorkspaceDoc[];
  matchStatus: "saved" | "applied" | null;
  closing: ClosingInfo | null;
  lastActivity: string | null;
}

interface BidWorkspaceRow {
  tender_id: string;
  checklist: unknown;
  notes: string | null;
  updated_at: string;
}

interface DocumentFillRow {
  tender_id: string | null;
  doc_key: string;
  doc_name: string;
  updated_at: string;
}

interface MatchRow {
  tender_id: string;
  status: string;
}

// A tender belongs in "My workspace" once the user has started work on it —
// ticked a checklist item, begun filling a document, or saved/applied to it —
// so it shows up automatically without them having to go find it again.
export async function getWorkspaceEntries(
  supabase: Awaited<ReturnType<typeof getSupabaseAuthClient>>,
  userId: string
): Promise<WorkspaceEntry[]> {
  const [{ data: workspaces }, { data: fills }, { data: matches }] = await Promise.all([
    supabase
      .from("bid_workspaces")
      .select("tender_id, checklist, notes, updated_at")
      .eq("user_id", userId)
      .returns<BidWorkspaceRow[]>(),
    supabase
      .from("document_fills")
      .select("tender_id, doc_key, doc_name, updated_at")
      .eq("user_id", userId)
      .not("tender_id", "is", null)
      .returns<DocumentFillRow[]>(),
    supabase
      .from("tender_matches")
      .select("tender_id, status, matching_profiles!inner(user_id)")
      .eq("matching_profiles.user_id", userId)
      .in("status", ["saved", "applied"])
      .returns<MatchRow[]>(),
  ]);

  const workspaceByTender = new Map((workspaces ?? []).map((w) => [w.tender_id, w]));
  const fillsByTender = new Map<string, DocumentFillRow[]>();
  for (const f of fills ?? []) {
    if (!f.tender_id) continue;
    const list = fillsByTender.get(f.tender_id) ?? [];
    list.push(f);
    fillsByTender.set(f.tender_id, list);
  }
  const matchByTender = new Map((matches ?? []).map((m) => [m.tender_id, m.status]));

  const tenderIds = Array.from(
    new Set<string>([...workspaceByTender.keys(), ...fillsByTender.keys(), ...matchByTender.keys()])
  );
  if (tenderIds.length === 0) return [];

  const { data: tenders } = await supabase
    .from("tenders")
    .select("id, title, buyer_name, category, province, value_estimate, currency, closing_date")
    .in("id", tenderIds)
    .returns<WorkspaceTender[]>();

  return (tenders ?? []).map((tender) => {
    const workspace = workspaceByTender.get(tender.id);
    const checklist = normaliseChecklist(workspace?.checklist);
    const progress = checklistProgress(checklist);
    const docs = (fillsByTender.get(tender.id) ?? [])
      .slice()
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map((d) => {
        const parsedIndex = Number.parseInt(d.doc_key.split(":")[2] ?? "", 10);
        return {
          docKey: d.doc_key,
          docName: d.doc_name,
          docIndex: Number.isInteger(parsedIndex) ? parsedIndex : null,
          updatedAt: d.updated_at,
        };
      });
    const matchStatus = (matchByTender.get(tender.id) as "saved" | "applied" | undefined) ?? null;
    const closing = closingInfo(tender.closing_date);
    const activityDates = [workspace?.updated_at, ...docs.map((d) => d.updatedAt)].filter(
      (d): d is string => !!d
    );
    const lastActivity = activityDates.length ? activityDates.sort().at(-1)! : null;

    return {
      tender,
      hasChecklist: !!workspace,
      progressDone: progress.done,
      progressTotal: progress.total,
      notes: workspace?.notes ?? null,
      docs,
      matchStatus,
      closing,
      lastActivity,
    };
  });
}

// Urgent (closing soon) first, then no-deadline items by most recent
// activity, with closed-and-not-submitted bids pushed to the bottom.
export function sortWorkspaceEntries(entries: WorkspaceEntry[]): WorkspaceEntry[] {
  return [...entries].sort((a, b) => {
    const aClosed = a.closing ? a.closing.days < 0 : false;
    const bClosed = b.closing ? b.closing.days < 0 : false;
    if (aClosed !== bClosed) return aClosed ? 1 : -1;

    const aDays = a.closing && !aClosed ? a.closing.days : null;
    const bDays = b.closing && !bClosed ? b.closing.days : null;
    if (aDays !== null && bDays !== null) return aDays - bDays;
    if (aDays !== null) return -1;
    if (bDays !== null) return 1;

    return (b.lastActivity ?? "").localeCompare(a.lastActivity ?? "");
  });
}
