// Standard bid-preparation checklist for a South African government tender.
// The item *definitions* live here in code; only the per-bid state (which
// items are ticked, plus any custom tasks and notes) is persisted, in
// bid_workspaces.checklist. Item ids are stable strings — don't rename them,
// or saved progress won't line up.

export interface ChecklistItem {
  id: string;
  label: string;
}

export interface ChecklistGroup {
  heading: string;
  items: ChecklistItem[];
}

export const STANDARD_CHECKLIST: ChecklistGroup[] = [
  {
    heading: "SBD forms",
    items: [
      { id: "sbd-1", label: "SBD 1 — Invitation to Bid / bidder's particulars" },
      { id: "sbd-4", label: "SBD 4 — Declaration of Interest" },
      { id: "sbd-6.1", label: "SBD 6.1 — Preference Points Claim" },
      { id: "sbd-8", label: "SBD 8 — Declaration of past SCM practices" },
      { id: "sbd-9", label: "SBD 9 — Certificate of Independent Bid Determination" },
    ],
  },
  {
    heading: "Supporting documents",
    items: [
      { id: "doc-csd", label: "CSD registration confirmation (active)" },
      { id: "doc-tax", label: "Valid SARS Tax Compliance Status PIN" },
      { id: "doc-bbbee", label: "B-BBEE certificate or sworn affidavit" },
      { id: "doc-id", label: "Certified copies of directors' IDs" },
      { id: "doc-cipc", label: "CIPC company registration documents" },
      { id: "doc-bank", label: "Bank confirmation letter" },
    ],
  },
  {
    heading: "Final steps",
    items: [
      { id: "final-pricing", label: "Pricing schedule / bid response completed" },
      { id: "final-signed", label: "All forms signed by the authorised signatory" },
      { id: "final-submitted", label: "Bid submitted before the closing date" },
    ],
  },
];

export interface CustomTask {
  id: string;
  label: string;
  done: boolean;
}

export interface WorkspaceChecklist {
  done: Record<string, boolean>;
  custom: CustomTask[];
}

export function emptyChecklist(): WorkspaceChecklist {
  return { done: {}, custom: [] };
}

// Normalises whatever came back from jsonb into a well-formed checklist,
// tolerating nulls/partial shapes from older rows.
export function normaliseChecklist(raw: unknown): WorkspaceChecklist {
  const value = (raw ?? {}) as Partial<WorkspaceChecklist>;
  return {
    done: value.done && typeof value.done === "object" ? value.done : {},
    custom: Array.isArray(value.custom)
      ? value.custom.filter(
          (t): t is CustomTask =>
            !!t && typeof t.id === "string" && typeof t.label === "string"
        )
      : [],
  };
}

export function checklistProgress(checklist: WorkspaceChecklist): {
  done: number;
  total: number;
} {
  const standardTotal = STANDARD_CHECKLIST.reduce((n, g) => n + g.items.length, 0);
  const standardDone = STANDARD_CHECKLIST.reduce(
    (n, g) => n + g.items.filter((i) => checklist.done[i.id]).length,
    0
  );
  return {
    done: standardDone + checklist.custom.filter((t) => t.done).length,
    total: standardTotal + checklist.custom.length,
  };
}

export interface ClosingInfo {
  label: string;
  urgent: boolean;
  days: number;
}

// Days until closing, computed server-side to avoid a hydration mismatch.
// `days` is exposed so callers can sort by urgency, not just display a label.
export function closingInfo(closingDate: string | null | undefined): ClosingInfo | null {
  if (!closingDate) return null;
  const closing = new Date(closingDate);
  const now = new Date();
  const days = Math.ceil((closing.getTime() - now.getTime()) / 86_400_000);
  if (days < 0) return { label: "Closed", urgent: true, days };
  if (days === 0) return { label: "Closes today", urgent: true, days };
  if (days === 1) return { label: "Closes tomorrow", urgent: true, days };
  return { label: `Closes in ${days} days`, urgent: days <= 7, days };
}
