import { getSupabaseAuthClient, getCurrentUser } from "@/lib/supabase-auth";
import { getWorkspaceEntries, sortWorkspaceEntries, type WorkspaceEntry } from "@/lib/workspace-hub";
import { formatDate, formatValue } from "@/lib/format";
import { IconBuilding, IconTag, IconMapPin, IconDocument, IconClipboard } from "../components/icons";

export const dynamic = "force-dynamic";

const TABS = ["all", "closing-soon", "submitted", "closed"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = {
  all: "All",
  "closing-soon": "Closing soon",
  submitted: "Submitted",
  closed: "Closed",
};

function matchesTab(entry: WorkspaceEntry, tab: Tab): boolean {
  switch (tab) {
    case "closing-soon":
      return !!entry.closing && entry.closing.days >= 0 && entry.closing.days <= 7;
    case "submitted":
      return entry.matchStatus === "applied";
    case "closed":
      return !!entry.closing && entry.closing.days < 0;
    default:
      return true;
  }
}

export default async function MyWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const tab: Tab = TABS.includes(params.tab as Tab) ? (params.tab as Tab) : "all";

  const user = await getCurrentUser();
  const supabase = await getSupabaseAuthClient();
  const entries = await getWorkspaceEntries(supabase, user?.id ?? "");

  const counts = {
    all: entries.length,
    "closing-soon": entries.filter((e) => matchesTab(e, "closing-soon")).length,
    submitted: entries.filter((e) => matchesTab(e, "submitted")).length,
    closed: entries.filter((e) => matchesTab(e, "closed")).length,
  };

  const visible = sortWorkspaceEntries(entries.filter((e) => matchesTab(e, tab)));

  return (
    <main>
      <h1>My workspace</h1>
      <p className="subtitle">
        Every bid you&apos;re currently working on, gathered in one place — no need to hunt for it
        on the tender list.
      </p>

      {entries.length === 0 ? (
        <div className="hub-empty">
          <IconClipboard className="hub-empty-icon" />
          <h3>Nothing here yet</h3>
          <p>
            Save a tender, mark one as applied, or start on its checklist or documents — it will
            show up here automatically from then on.
          </p>
          <a href="/dashboard" className="page-nav-cta">
            Browse matched tenders
          </a>
        </div>
      ) : (
        <>
          <div className="stats-bar">
            <div className="stat-card">
              <span className="stat-value">{counts.all}</span>
              <span className="stat-label">Active bids</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{counts["closing-soon"]}</span>
              <span className="stat-label">Closing within 7 days</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{counts.submitted}</span>
              <span className="stat-label">Submitted</span>
            </div>
          </div>

          <div className="filter-bar">
            <nav className="filters">
              {TABS.map((t) => (
                <a
                  key={t}
                  href={t === "all" ? "/workspace" : `/workspace?tab=${t}`}
                  className={t === tab ? "active" : ""}
                >
                  {TAB_LABELS[t]} ({counts[t]})
                </a>
              ))}
            </nav>
          </div>

          {visible.length === 0 && (
            <p className="empty-state">Nothing in this view.</p>
          )}

          {visible.map((entry) => {
            const { tender } = entry;
            const closed = !!entry.closing && entry.closing.days < 0;
            const pct = entry.progressTotal
              ? Math.round((entry.progressDone / entry.progressTotal) * 100)
              : 0;

            return (
              <article className={`hub-card ${closed ? "closed" : ""}`} key={tender.id}>
                <div className="hub-card-top">
                  <div>
                    <h3 className="hub-card-title">
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
                        <span className="meta-item">
                          {formatValue(tender.value_estimate, tender.currency)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="badges">
                    {entry.closing && (
                      <span className={`badge ${entry.closing.urgent ? "status-new" : "neutral"}`}>
                        {entry.closing.label}
                      </span>
                    )}
                    {entry.matchStatus && (
                      <span className={`badge status-${entry.matchStatus}`}>{entry.matchStatus}</span>
                    )}
                  </div>
                </div>

                {entry.hasChecklist ? (
                  <div className="hub-card-progress">
                    <div className="hub-progress-row">
                      <span>Checklist</span>
                      <span>
                        {entry.progressDone}/{entry.progressTotal} complete
                      </span>
                    </div>
                    <div className="workspace-progress-bar compact">
                      <div className="workspace-progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                ) : (
                  <p className="hub-card-hint">Checklist not started yet.</p>
                )}

                {entry.docs.length > 0 && (
                  <div className="hub-card-docs">
                    <span className="hub-card-docs-heading">
                      <IconDocument className="meta-icon" />
                      {entry.docs.length} document{entry.docs.length > 1 ? "s" : ""} in progress
                    </span>
                    <ul className="hub-doc-list">
                      {entry.docs.slice(0, 3).map((doc) => (
                        <li key={doc.docKey}>
                          <a
                            href={
                              doc.docIndex != null
                                ? `/fill?tender=${tender.id}&doc=${doc.docIndex}`
                                : `/fill?tender=${tender.id}`
                            }
                          >
                            {doc.docName}
                          </a>
                          <span className="hub-doc-meta">Saved {formatDate(doc.updatedAt)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {entry.notes && (
                  <p className="hub-card-note">
                    {entry.notes.length > 140 ? `${entry.notes.slice(0, 140)}…` : entry.notes}
                  </p>
                )}

                <div className="hub-card-actions">
                  <a href={`/tenders/${tender.id}/workspace`} className="btn">
                    {entry.hasChecklist ? "Continue checklist" : "Start checklist"}
                  </a>
                  <a href={`/fill?tender=${tender.id}`} className="btn">
                    {entry.docs.length > 0 ? "Resume documents" : "Fill documents"}
                  </a>
                  <a href={`/tenders/${tender.id}`} className="hub-view-link">
                    View tender &rarr;
                  </a>
                </div>
              </article>
            );
          })}
        </>
      )}
    </main>
  );
}
