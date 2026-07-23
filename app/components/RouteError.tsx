"use client";

import { useEffect } from "react";

// Shared error.tsx body for every route segment — Next.js's default error
// overlay/page is a raw stack trace in production, not something to show a
// user mid-task. Logs to the console (Vercel captures this in Runtime Logs)
// and gives them a way back in instead.
export function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="route-error">
      <h1>Something went wrong</h1>
      <p>
        That didn&apos;t go through — nothing you had should be lost. Try again, or head back and
        pick up where you left off.
      </p>
      <div className="route-error-actions">
        <button type="button" className="btn-primary" onClick={reset}>
          Try again
        </button>
        <a href="/dashboard" className="btn-secondary">
          Back to dashboard
        </a>
      </div>
    </main>
  );
}
