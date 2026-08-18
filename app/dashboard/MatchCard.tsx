"use client";

import { useState, useTransition } from "react";
import { updateMatchStatus } from "../actions";

/**
 * Wraps a dashboard match card so Save/Mark applied/Dismiss get real exit
 * motion instead of the card just vanishing when the next server render
 * arrives. Only animates out when the new status would actually drop the
 * card from the tab currently being viewed — e.g. clicking Save while
 * looking at "All" leaves the card in place (just the badge updates on the
 * next render), so there's nothing to animate away.
 *
 * The exit plays entirely client-side before the server action fires, so
 * it's consistent regardless of how fast the mutation/revalidation is —
 * a fast response can't cut the animation short.
 */
export function MatchCard({
  matchId,
  status,
  statusFilter,
  index,
  className,
  children,
}: {
  matchId: string;
  status: string;
  statusFilter: string;
  index: number;
  className: string;
  children: React.ReactNode;
}) {
  const [exiting, setExiting] = useState(false);
  const [isPending, startTransition] = useTransition();

  const willStayVisible = (newStatus: string) =>
    statusFilter === "all" ? newStatus !== "dismissed" : newStatus === statusFilter;

  const act = (newStatus: string) => {
    const fire = () => startTransition(() => updateMatchStatus(matchId, newStatus));
    if (willStayVisible(newStatus)) {
      fire();
    } else {
      setExiting(true);
      setTimeout(fire, 260);
    }
  };

  const busy = isPending || exiting;

  return (
    <div
      className={`match-card-wrap ${exiting ? "is-exiting" : ""}`}
      style={{ animationDelay: `${Math.min(index, 7) * 30}ms` }}
    >
      <article className={className}>
        {children}

        {status !== "dismissed" && (
          <div className="match-actions">
            {status !== "saved" && (
              <button type="button" disabled={busy} onClick={() => act("saved")}>
                Save
              </button>
            )}
            {status !== "applied" && (
              <button type="button" disabled={busy} onClick={() => act("applied")}>
                Mark applied
              </button>
            )}
            <div className="dismiss-button">
              <button type="button" disabled={busy} onClick={() => act("dismissed")}>
                Dismiss
              </button>
            </div>
          </div>
        )}
      </article>
    </div>
  );
}
