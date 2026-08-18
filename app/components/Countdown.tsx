"use client";

import { useEffect, useState } from "react";

function parts(msLeft: number) {
  const s = Math.max(0, Math.floor(msLeft / 1000));
  return {
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
  };
}

/**
 * Live countdown to a tender's closing date.
 *
 * `fallback` is what the server renders (a plain day count). The ticking
 * clock only starts after mount, so there's no server/client mismatch and no
 * hydration warning — the number just comes alive a moment after paint.
 */
export function Countdown({ iso, fallback }: { iso: string; fallback: string }) {
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const target = new Date(iso).getTime();
    const tick = () => setLeft(target - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [iso]);

  if (left === null) return <span className="m-clock">{fallback}</span>;
  if (left <= 0) return <span className="m-clock">Closed</span>;

  const { d, h, m, s } = parts(left);
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <span className="m-clock" aria-label={`${d} days, ${h} hours, ${m} minutes remaining`}>
      <span className="m-clock-num">{d}</span>
      <span className="m-clock-unit">d</span>
      <span className="m-clock-num">{pad(h)}</span>
      <span className="m-clock-unit">h</span>
      <span className="m-clock-num">{pad(m)}</span>
      <span className="m-clock-unit">m</span>
      <span className="m-clock-num m-clock-sec">{pad(s)}</span>
      <span className="m-clock-unit">s</span>
    </span>
  );
}
