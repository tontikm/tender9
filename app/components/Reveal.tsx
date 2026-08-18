"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Scroll-triggered fade/rise, the way Apple's marketing pages introduce each
 * section as you reach it. Starts visible and only *becomes* hidden once JS
 * confirms it can animate — so with JS off, or before hydration, the content
 * is simply there rather than stuck at opacity 0.
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    // Already past it on load (deep link / refresh mid-page): leave it shown.
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return;

    setShown(false);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`m-reveal ${shown ? "is-in" : ""} ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
