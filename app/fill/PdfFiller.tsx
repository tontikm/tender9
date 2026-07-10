"use client";

// Click-to-place PDF filler. Renders any PDF (digital or scanned) with
// pdf.js, lets the user place their saved company details (or free text) on
// top of the pages, then bakes the text into the ORIGINAL document with
// pdf-lib — all in the browser, so the file never leaves the user's machine
// (tender documents come through our existing same-origin proxy).

import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

export interface FillChip {
  label: string;
  value: string;
}

interface Placement {
  id: string;
  page: number; // 0-based
  xPct: number; // fraction of page width (top-left anchor)
  yPct: number; // fraction of page height
  text: string;
  size: number; // font size in PDF points
}

interface PageMeta {
  cssW: number;
  cssH: number;
  scale: number; // css px per PDF point
}

const DEFAULT_SIZE = 10;
const MIN_SIZE = 6;
const MAX_SIZE = 24;

// pdf-lib's standard Helvetica uses WinAnsi encoding — map smart punctuation
// to safe equivalents and replace anything else it can't encode.
function sanitizeForPdf(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "?");
}

function truncate(text: string, max = 40): string {
  const oneLine = text.replace(/\n/g, " ");
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

function clamp01(n: number): number {
  return Math.min(0.98, Math.max(0, n));
}

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();
  return pdfjs;
}

export function PdfFiller({
  chips,
  initialDocUrl,
  initialDocName,
  initialDocKey,
}: {
  chips: FillChip[];
  initialDocUrl?: string;
  initialDocName?: string;
  initialDocKey?: string;
}) {
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [docName, setDocName] = useState(initialDocName ?? "");
  const [docKey, setDocKey] = useState("");
  const [pages, setPages] = useState<PageMeta[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [armed, setArmed] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [customText, setCustomText] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    initialDocUrl ? "loading" : "idle"
  );
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const wrapRefs = useRef<(HTMLDivElement | null)[]>([]);
  const columnRef = useRef<HTMLDivElement | null>(null);
  const loadedKeyRef = useRef<string | null>(null);

  const openBytes = useCallback(async (data: Uint8Array, name: string, key: string) => {
    setStatus("loading");
    setError(null);
    setPages([]);
    setSelectedId(null);
    setArmed(null);
    try {
      const pdfjs = await loadPdfjs();
      // pdf.js transfers the buffer to its worker, so give it a copy and keep
      // the original for pdf-lib to bake into later.
      void pdfDocRef.current?.loadingTask.destroy();
      const doc = await pdfjs.getDocument({ data: data.slice() }).promise;
      pdfDocRef.current = doc;

      const colW = Math.min((columnRef.current?.clientWidth ?? 840) - 32, 860);
      const metas: PageMeta[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const vp = page.getViewport({ scale: 1 });
        const scale = colW / vp.width;
        metas.push({ cssW: colW, cssH: vp.height * scale, scale });
      }
      canvasRefs.current = [];
      wrapRefs.current = [];
      setBytes(data);
      setDocName(name);
      setDocKey(key);
      setPages(metas);
      setStatus("ready");
    } catch (e) {
      setStatus("error");
      setError(`Could not open this PDF: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  // Load the initial (tender) document, if any.
  useEffect(() => {
    if (!initialDocUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(initialDocUrl);
        if (!res.ok) throw new Error(`the server returned ${res.status}`);
        const buf = new Uint8Array(await res.arrayBuffer());
        if (!cancelled) {
          await openBytes(buf, initialDocName ?? "document.pdf", initialDocKey ?? `url:${initialDocUrl}`);
        }
      } catch (e) {
        if (!cancelled) {
          setStatus("error");
          setError(`Could not load the document: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialDocUrl, initialDocName, initialDocKey, openBytes]);

  // Draw pages onto their canvases once metas exist.
  useEffect(() => {
    const doc = pdfDocRef.current;
    if (!doc || pages.length === 0) return;
    let cancelled = false;
    (async () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      for (let i = 0; i < pages.length; i++) {
        if (cancelled) return;
        const canvas = canvasRefs.current[i];
        if (!canvas || canvas.dataset.rendered === `${docKey}:${i}`) continue;
        const page = await doc.getPage(i + 1);
        const vp = page.getViewport({ scale: pages[i].scale * dpr });
        canvas.width = vp.width;
        canvas.height = vp.height;
        canvas.style.width = `${pages[i].cssW}px`;
        canvas.style.height = `${pages[i].cssH}px`;
        await page.render({ canvasContext: canvas.getContext("2d")!, viewport: vp, canvas }).promise;
        canvas.dataset.rendered = `${docKey}:${i}`;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pages, docKey]);

  // Placements persist per document on this device.
  useEffect(() => {
    if (!docKey) return;
    try {
      const raw = localStorage.getItem(`t9-fill:${docKey}`);
      setPlacements(raw ? (JSON.parse(raw) as Placement[]) : []);
    } catch {
      setPlacements([]);
    }
    loadedKeyRef.current = docKey;
  }, [docKey]);

  useEffect(() => {
    if (!docKey || loadedKeyRef.current !== docKey) return;
    try {
      localStorage.setItem(`t9-fill:${docKey}`, JSON.stringify(placements));
    } catch {
      // Storage full/blocked — the session still works, it just won't persist.
    }
  }, [placements, docKey]);

  // Delete/Backspace removes the selected placement (unless typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selectedId) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        setPlacements((ps) => ps.filter((p) => p.id !== selectedId));
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please choose a PDF file.");
      return;
    }
    const buf = new Uint8Array(await file.arrayBuffer());
    await openBytes(buf, file.name, `upload:${file.name}:${file.size}`);
  };

  const onPageClick = (e: React.MouseEvent, pageIdx: number) => {
    if (!armed) {
      setSelectedId(null);
      return;
    }
    const wrap = wrapRefs.current[pageIdx];
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const id = crypto.randomUUID();
    setPlacements((ps) => [
      ...ps,
      {
        id,
        page: pageIdx,
        xPct: clamp01((e.clientX - rect.left) / rect.width),
        yPct: clamp01((e.clientY - rect.top) / rect.height),
        text: armed,
        size: DEFAULT_SIZE,
      },
    ]);
    setArmed(null);
    setSelectedId(id);
  };

  const startDrag = (e: React.PointerEvent, placement: Placement) => {
    e.stopPropagation();
    setSelectedId(placement.id);
    const wrap = wrapRefs.current[placement.page];
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = placement.xPct;
    const origY = placement.yPct;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / rect.width;
      const dy = (ev.clientY - startY) / rect.height;
      setPlacements((ps) =>
        ps.map((p) =>
          p.id === placement.id ? { ...p, xPct: clamp01(origX + dx), yPct: clamp01(origY + dy) } : p
        )
      );
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const resizeSelected = (delta: number) => {
    if (!selectedId) return;
    setPlacements((ps) =>
      ps.map((p) =>
        p.id === selectedId
          ? { ...p, size: Math.min(MAX_SIZE, Math.max(MIN_SIZE, p.size + delta)) }
          : p
      )
    );
  };

  const removeSelected = () => {
    if (!selectedId) return;
    setPlacements((ps) => ps.filter((p) => p.id !== selectedId));
    setSelectedId(null);
  };

  const download = async () => {
    if (!bytes || placements.length === 0) return;
    setDownloading(true);
    setError(null);
    try {
      const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const font = await doc.embedFont(StandardFonts.Helvetica);
      for (const p of placements) {
        if (p.page >= doc.getPageCount()) continue;
        const page = doc.getPage(p.page);
        const { width, height } = page.getSize();
        const lines = sanitizeForPdf(p.text).split("\n");
        lines.forEach((line, li) => {
          page.drawText(line, {
            x: p.xPct * width,
            // pdf-lib's origin is bottom-left and y is the text baseline;
            // our anchor is the top-left of the text (matching the overlay).
            y: height - p.yPct * height - p.size * 0.75 - li * p.size * 1.2,
            size: p.size,
            font,
            color: rgb(0.05, 0.05, 0.05),
          });
        });
      }
      const out = await doc.save();
      const blob = new Blob([out as unknown as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Filled-${(docName || "document").replace(/\.pdf$/i, "")}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setError(
        `Could not generate the filled PDF: ${e instanceof Error ? e.message : String(e)}`
      );
    }
    setDownloading(false);
  };

  const selected = placements.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="fill-layout">
      <div className={`fill-pages ${armed ? "armed" : ""}`} ref={columnRef}>
        {status === "idle" && (
          <p className="fill-status">
            Open a PDF to get started — a tender document, or any form saved on your computer.
          </p>
        )}
        {status === "loading" && <p className="fill-status">Loading document…</p>}
        {status === "error" && <p className="fill-status">{error}</p>}
        {pages.map((m, i) => (
          <div
            key={`${docKey}:${i}`}
            className="fill-page"
            style={{ width: m.cssW, height: m.cssH }}
            ref={(el) => {
              wrapRefs.current[i] = el;
            }}
            onClick={(e) => onPageClick(e, i)}
          >
            <canvas
              ref={(el) => {
                canvasRefs.current[i] = el;
              }}
            />
            {placements
              .filter((p) => p.page === i)
              .map((p) => (
                <span
                  key={p.id}
                  className={`fill-item ${selectedId === p.id ? "selected" : ""}`}
                  style={{
                    left: `${p.xPct * 100}%`,
                    top: `${p.yPct * 100}%`,
                    fontSize: p.size * m.scale,
                  }}
                  onPointerDown={(e) => startDrag(e, p)}
                  onClick={(e) => e.stopPropagation()}
                >
                  {p.text}
                </span>
              ))}
          </div>
        ))}
      </div>

      <aside className="fill-sidebar">
        <label className="fill-upload">
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => onFile(e.target.files?.[0] ?? undefined)}
          />
          {bytes ? "Open a different PDF…" : "Choose a PDF from your computer…"}
        </label>
        {docName && <p className="fill-docname">{docName}</p>}

        <h3 className="fill-heading">Your details</h3>
        {chips.length === 0 ? (
          <p className="hint">
            Complete your <a href="/company">company profile</a> to place your details with one
            click.
          </p>
        ) : (
          <div className="fill-chips">
            {chips.map((c) => (
              <button
                key={c.label}
                type="button"
                className={`fill-chip ${armed === c.value ? "armed" : ""}`}
                onClick={() => setArmed(armed === c.value ? null : c.value)}
                title={c.value}
              >
                <span className="fill-chip-label">{c.label}</span>
                <span className="fill-chip-value">{truncate(c.value, 32)}</span>
              </button>
            ))}
          </div>
        )}

        <h3 className="fill-heading">Custom text</h3>
        <div className="fill-custom">
          <input
            type="text"
            value={customText}
            placeholder="e.g. N/A, Yes, initials…"
            onChange={(e) => setCustomText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && customText.trim()) {
                e.preventDefault();
                setArmed(customText.trim());
              }
            }}
          />
          <button
            type="button"
            disabled={!customText.trim()}
            onClick={() => setArmed(customText.trim())}
          >
            Place
          </button>
        </div>

        {armed && (
          <p className="fill-armed-note">
            Click on the document where <strong>“{truncate(armed, 28)}”</strong> should go.{" "}
            <button type="button" onClick={() => setArmed(null)}>
              Cancel
            </button>
          </p>
        )}

        {selected && (
          <div className="fill-selected">
            <h3 className="fill-heading">Selected: “{truncate(selected.text, 24)}”</h3>
            <div className="fill-selected-controls">
              <button type="button" onClick={() => resizeSelected(-1)} aria-label="Smaller text">
                A−
              </button>
              <span>{selected.size}pt</span>
              <button type="button" onClick={() => resizeSelected(1)} aria-label="Bigger text">
                A+
              </button>
              <button type="button" className="fill-remove" onClick={removeSelected}>
                Remove
              </button>
            </div>
            <p className="hint">Drag it on the page to fine-tune the position.</p>
          </div>
        )}

        <div className="fill-actions">
          <button
            type="button"
            className="fill-download"
            disabled={!bytes || placements.length === 0 || downloading}
            onClick={download}
          >
            {downloading ? "Preparing…" : `Download filled PDF${placements.length ? ` (${placements.length})` : ""}`}
          </button>
          {placements.length > 0 && (
            <button
              type="button"
              className="fill-clear"
              onClick={() => {
                setPlacements([]);
                setSelectedId(null);
              }}
            >
              Clear all placements
            </button>
          )}
          <p className="hint">
            The original document is untouched — your text is written on top. Placements save
            automatically on this device.
          </p>
        </div>

        {error && status !== "error" && <p className="auth-error">{error}</p>}
      </aside>
    </div>
  );
}
