"use client";

// Click-to-place PDF filler. Renders any PDF (digital or scanned) with
// pdf.js, lets the user place their saved company details (or free text) on
// top of the pages, then bakes the text into the ORIGINAL document with
// pdf-lib — all in the browser, so the file never leaves the user's machine
// (tender documents come through our existing same-origin proxy).

import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { SignaturePad } from "./SignaturePad";

export interface FillChip {
  label: string;
  value: string;
}

type MarkType = "check" | "cross";

interface InkPoint {
  x: number; // fraction of page width
  y: number; // fraction of page height
}

interface Placement {
  id: string;
  page: number; // 0-based
  xPct: number; // fraction of page width (top-left anchor; unused for ink)
  yPct: number; // fraction of page height
  kind: "text" | "image" | "mark" | "ink";
  text?: string; // text placements
  dataUrl?: string; // image (signature) placements
  aspect?: number; // image width / height
  mark?: MarkType; // tick / cross placements
  points?: InkPoint[]; // freehand-pen placements
  color?: string; // ink colour (hex)
  size: number; // text: font size; image/mark: box size; ink: stroke thickness (pt)
}

// What's currently "armed" to be placed on the next page click.
type Armed =
  | { kind: "text"; text: string }
  | { kind: "image"; dataUrl: string; aspect: number }
  | { kind: "mark"; mark: MarkType }
  | null;

// SVG paths (viewBox 0 0 24 24) reused for the on-page overlay and the PDF bake.
const MARK_PATHS: Record<MarkType, [number, number][][]> = {
  // each entry is a polyline of [x,y] points in 0..24 space
  check: [[[4, 13], [10, 19], [20, 5]]],
  cross: [[[5, 5], [19, 19]], [[19, 5], [5, 19]]],
};

interface SavedSig {
  dataUrl: string;
  aspect: number;
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const bin = atob(dataUrl.split(",")[1] ?? "");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

interface PageMeta {
  cssW: number;
  cssH: number;
  scale: number; // css px per PDF point
}

const DEFAULT_SIZE = 10;
const MIN_SIZE = 6;
const MAX_SIZE = 24;
const DEFAULT_SIG_HEIGHT = 30; // pt
const MIN_SIG = 12;
const MAX_SIG = 90;
const DEFAULT_MARK = 16; // pt box
const MIN_MARK = 8;
const MAX_MARK = 48;
const DEFAULT_INK = 1.8; // pt stroke
const MIN_INK = 0.8;
const MAX_INK = 6;
const PEN_COLORS = ["#1a1a1a", "#c81e1e", "#1d4ed8"]; // black, red, blue

function hexToRgb01(hex: string): [number, number, number] {
  const n = hex.replace("#", "");
  return [
    parseInt(n.slice(0, 2), 16) / 255,
    parseInt(n.slice(2, 4), 16) / 255,
    parseInt(n.slice(4, 6), 16) / 255,
  ];
}

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
  tenderDocs = [],
  initialKey,
}: {
  chips: FillChip[];
  tenderDocs?: { name: string; url: string; key: string }[];
  initialKey?: string;
}) {
  const firstKey = initialKey ?? tenderDocs[0]?.key ?? "";
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [docName, setDocName] = useState("");
  const [docKey, setDocKey] = useState("");
  const [currentKey, setCurrentKey] = useState(firstKey);
  const [pages, setPages] = useState<PageMeta[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [armed, setArmed] = useState<Armed>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [customText, setCustomText] = useState("");
  const [savedSig, setSavedSig] = useState<SavedSig | null>(null);
  const [drawMode, setDrawMode] = useState(false);
  const [penColor, setPenColor] = useState(PEN_COLORS[0]);
  const [draftPage, setDraftPage] = useState<number | null>(null);
  const [draftPoints, setDraftPoints] = useState<InkPoint[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    firstKey ? "loading" : "idle"
  );
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const wrapRefs = useRef<(HTMLDivElement | null)[]>([]);
  const columnRef = useRef<HTMLDivElement | null>(null);
  const loadedKeyRef = useRef<string | null>(null);
  const loadedDocKeyRef = useRef("");
  const strokeRef = useRef<{ page: number; points: InkPoint[] } | null>(null);

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
      loadedDocKeyRef.current = key;
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

  // Load the selected tender document (on mount, and when the picker changes).
  // Uploads set currentKey to their own key, which isn't in tenderDocs, so
  // this effect leaves them alone.
  useEffect(() => {
    const doc = tenderDocs.find((d) => d.key === currentKey);
    if (!doc || loadedDocKeyRef.current === doc.key) return;
    let cancelled = false;
    (async () => {
      try {
        setStatus("loading");
        const res = await fetch(doc.url);
        if (!res.ok) throw new Error(`the server returned ${res.status}`);
        const buf = new Uint8Array(await res.arrayBuffer());
        if (!cancelled) await openBytes(buf, doc.name, doc.key);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey]);

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

  // Reuse the last-drawn signature across documents/sessions.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("t9-signature");
      if (raw) setSavedSig(JSON.parse(raw) as SavedSig);
    } catch {
      // ignore
    }
  }, []);

  // Arming an item and pen-draw mode are mutually exclusive.
  useEffect(() => {
    if (armed) setDrawMode(false);
  }, [armed]);

  const useSignature = (dataUrl: string, aspect: number) => {
    setArmed({ kind: "image", dataUrl, aspect });
    setSavedSig({ dataUrl, aspect });
    try {
      localStorage.setItem("t9-signature", JSON.stringify({ dataUrl, aspect }));
    } catch {
      // storage full/blocked — still usable this session
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please choose a PDF file.");
      return;
    }
    const buf = new Uint8Array(await file.arrayBuffer());
    const key = `upload:${file.name}:${file.size}`;
    await openBytes(buf, file.name, key);
    setCurrentKey(key);
  };

  const pageFraction = (e: { clientX: number; clientY: number }, pageIdx: number): InkPoint | null => {
    const wrap = wrapRefs.current[pageIdx];
    if (!wrap) return null;
    const rect = wrap.getBoundingClientRect();
    return { x: clamp01((e.clientX - rect.left) / rect.width), y: clamp01((e.clientY - rect.top) / rect.height) };
  };

  const startStroke = (e: React.PointerEvent, pageIdx: number) => {
    const p = pageFraction(e, pageIdx);
    if (!p) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // no active pointer to capture (e.g. synthetic events) — drawing still works
    }
    setSelectedId(null);
    strokeRef.current = { page: pageIdx, points: [p] };
    setDraftPage(pageIdx);
    setDraftPoints([p]);
  };

  const extendStroke = (e: React.PointerEvent, pageIdx: number) => {
    const active = strokeRef.current;
    if (!active || active.page !== pageIdx) return;
    const p = pageFraction(e, pageIdx);
    if (!p) return;
    active.points.push(p);
    setDraftPoints([...active.points]);
  };

  const endStroke = () => {
    const active = strokeRef.current;
    if (active && active.points.length >= 2) {
      setPlacements((ps) => [
        ...ps,
        {
          id: crypto.randomUUID(),
          page: active.page,
          xPct: 0,
          yPct: 0,
          kind: "ink",
          points: active.points,
          color: penColor,
          size: DEFAULT_INK,
        },
      ]);
    }
    strokeRef.current = null;
    setDraftPage(null);
    setDraftPoints([]);
  };

  const dragInk = (e: React.PointerEvent, placement: Placement) => {
    e.stopPropagation();
    setSelectedId(placement.id);
    const wrap = wrapRefs.current[placement.page];
    if (!wrap || !placement.points) return;
    const rect = wrap.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const orig = placement.points;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / rect.width;
      const dy = (ev.clientY - startY) / rect.height;
      setPlacements((ps) =>
        ps.map((p) =>
          p.id === placement.id
            ? { ...p, points: orig.map((pt) => ({ x: clamp01(pt.x + dx), y: clamp01(pt.y + dy) })) }
            : p
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

  const onPageClick = (e: React.MouseEvent, pageIdx: number) => {
    if (drawMode) return; // pointer handlers draw instead
    if (!armed) {
      setSelectedId(null);
      return;
    }
    const wrap = wrapRefs.current[pageIdx];
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const id = crypto.randomUUID();
    const base = {
      id,
      page: pageIdx,
      xPct: clamp01((e.clientX - rect.left) / rect.width),
      yPct: clamp01((e.clientY - rect.top) / rect.height),
    };
    let placement: Placement;
    if (armed.kind === "text") {
      placement = { ...base, kind: "text", text: armed.text, size: DEFAULT_SIZE };
    } else if (armed.kind === "image") {
      placement = { ...base, kind: "image", dataUrl: armed.dataUrl, aspect: armed.aspect, size: DEFAULT_SIG_HEIGHT };
    } else {
      placement = { ...base, kind: "mark", mark: armed.mark, size: DEFAULT_MARK };
    }
    setPlacements((ps) => [...ps, placement]);
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
      ps.map((p) => {
        if (p.id !== selectedId) return p;
        const [min, max] =
          p.kind === "image"
            ? [MIN_SIG, MAX_SIG]
            : p.kind === "mark"
              ? [MIN_MARK, MAX_MARK]
              : p.kind === "ink"
                ? [MIN_INK, MAX_INK]
                : [MIN_SIZE, MAX_SIZE];
        const step = p.kind === "text" ? delta : p.kind === "ink" ? delta * 0.5 : delta * 2;
        return { ...p, size: Math.min(max, Math.max(min, p.size + step)) };
      })
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
      const { PDFDocument, StandardFonts, rgb, LineCapStyle } = await import("pdf-lib");
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const font = await doc.embedFont(StandardFonts.Helvetica);
      for (const p of placements) {
        if (p.page >= doc.getPageCount()) continue;
        const page = doc.getPage(p.page);
        const { width, height } = page.getSize();

        if (p.kind === "image" && p.dataUrl) {
          const png = await doc.embedPng(dataUrlToBytes(p.dataUrl));
          const h = p.size;
          const w = p.size * (p.aspect ?? 1);
          page.drawImage(png, {
            x: p.xPct * width,
            // top-left anchor -> pdf-lib's bottom-left origin.
            y: height - p.yPct * height - h,
            width: w,
            height: h,
          });
          continue;
        }

        if (p.kind === "mark" && p.mark) {
          const f = p.size / 24; // scale from the 0..24 path space
          const x0 = p.xPct * width;
          const yTop = height - p.yPct * height; // PDF y of the box's top edge
          const ink = rgb(0.05, 0.05, 0.05);
          const thickness = Math.max(1.1, p.size * 0.11);
          for (const line of MARK_PATHS[p.mark]) {
            for (let i = 0; i < line.length - 1; i++) {
              page.drawLine({
                start: { x: x0 + line[i][0] * f, y: yTop - line[i][1] * f },
                end: { x: x0 + line[i + 1][0] * f, y: yTop - line[i + 1][1] * f },
                thickness,
                color: ink,
                lineCap: LineCapStyle.Round,
              });
            }
          }
          continue;
        }

        if (p.kind === "ink" && p.points && p.points.length >= 2) {
          const [r, g, b] = hexToRgb01(p.color ?? "#1a1a1a");
          for (let i = 0; i < p.points.length - 1; i++) {
            page.drawLine({
              start: { x: p.points[i].x * width, y: height - p.points[i].y * height },
              end: { x: p.points[i + 1].x * width, y: height - p.points[i + 1].y * height },
              thickness: p.size,
              color: rgb(r, g, b),
              lineCap: LineCapStyle.Round,
            });
          }
          continue;
        }

        const lines = sanitizeForPdf(p.text ?? "").split("\n");
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
      <div className={`fill-pages ${armed || drawMode ? "armed" : ""}`} ref={columnRef}>
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
            className={`fill-page ${drawMode ? "drawing" : ""}`}
            style={{ width: m.cssW, height: m.cssH }}
            ref={(el) => {
              wrapRefs.current[i] = el;
            }}
            onClick={(e) => onPageClick(e, i)}
            onPointerDown={drawMode ? (e) => startStroke(e, i) : undefined}
            onPointerMove={drawMode ? (e) => extendStroke(e, i) : undefined}
            onPointerUp={drawMode ? endStroke : undefined}
          >
            <canvas
              ref={(el) => {
                canvasRefs.current[i] = el;
              }}
            />
            {/* freehand strokes (existing + the one being drawn) */}
            {(() => {
              const inkOnPage = placements.filter((p) => p.page === i && p.kind === "ink");
              const draft =
                draftPage === i && draftPoints.length > 0
                  ? [{ points: draftPoints, color: penColor, size: DEFAULT_INK, id: "__draft", selected: false }]
                  : [];
              const strokes = [
                ...inkOnPage.map((p) => ({
                  points: p.points ?? [],
                  color: p.color ?? "#1a1a1a",
                  size: p.size,
                  id: p.id,
                  selected: selectedId === p.id,
                })),
                ...draft,
              ];
              if (strokes.length === 0) return null;
              return (
                <svg
                  className="fill-ink-layer"
                  viewBox="0 0 1 1"
                  preserveAspectRatio="none"
                  width={m.cssW}
                  height={m.cssH}
                >
                  {strokes.map((s) => (
                    <polyline
                      key={s.id}
                      points={s.points.map((pt) => `${pt.x},${pt.y}`).join(" ")}
                      fill="none"
                      stroke={s.selected ? "#0f766e" : s.color}
                      strokeWidth={s.size * m.scale}
                      vectorEffect="non-scaling-stroke"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      pointerEvents={drawMode || s.id === "__draft" ? "none" : "stroke"}
                      style={{ cursor: "move" }}
                      onPointerDown={(e) => {
                        const p = placements.find((pp) => pp.id === s.id);
                        if (p) dragInk(e, p);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ))}
                </svg>
              );
            })()}
            {placements
              .filter((p) => p.page === i && p.kind !== "ink")
              .map((p) =>
                p.kind === "mark" && p.mark ? (
                  <span
                    key={p.id}
                    className={`fill-item mark ${selectedId === p.id ? "selected" : ""}`}
                    style={{ left: `${p.xPct * 100}%`, top: `${p.yPct * 100}%` }}
                    onPointerDown={(e) => startDrag(e, p)}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <svg
                      width={p.size * m.scale}
                      height={p.size * m.scale}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#0d0d0d"
                      strokeWidth={2.6}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ display: "block" }}
                    >
                      {MARK_PATHS[p.mark].map((line, li) => (
                        <polyline key={li} points={line.map(([x, y]) => `${x},${y}`).join(" ")} />
                      ))}
                    </svg>
                  </span>
                ) : p.kind === "image" ? (
                  <span
                    key={p.id}
                    className={`fill-item image ${selectedId === p.id ? "selected" : ""}`}
                    style={{ left: `${p.xPct * 100}%`, top: `${p.yPct * 100}%` }}
                    onPointerDown={(e) => startDrag(e, p)}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <img
                      src={p.dataUrl}
                      alt="signature"
                      draggable={false}
                      style={{
                        display: "block",
                        height: p.size * m.scale,
                        width: p.size * (p.aspect ?? 1) * m.scale,
                      }}
                    />
                  </span>
                ) : (
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
                )
              )}
          </div>
        ))}
      </div>

      <aside className="fill-sidebar">
        {tenderDocs.length > 0 && (
          <div className="fill-docpicker">
            <label htmlFor="fill-doc-select">Tender document</label>
            <select
              id="fill-doc-select"
              value={tenderDocs.some((d) => d.key === docKey) ? docKey : ""}
              onChange={(e) => setCurrentKey(e.target.value)}
            >
              {tenderDocs.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.name}
                </option>
              ))}
              {bytes && !tenderDocs.some((d) => d.key === docKey) && (
                <option value="">Uploaded file</option>
              )}
            </select>
          </div>
        )}

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
            {chips.map((c) => {
              const isArmed = armed?.kind === "text" && armed.text === c.value;
              return (
                <button
                  key={c.label}
                  type="button"
                  className={`fill-chip ${isArmed ? "armed" : ""}`}
                  onClick={() => setArmed(isArmed ? null : { kind: "text", text: c.value })}
                  title={c.value}
                >
                  <span className="fill-chip-label">{c.label}</span>
                  <span className="fill-chip-value">{truncate(c.value, 32)}</span>
                </button>
              );
            })}
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
                setArmed({ kind: "text", text: customText.trim() });
              }
            }}
          />
          <button
            type="button"
            disabled={!customText.trim()}
            onClick={() => setArmed({ kind: "text", text: customText.trim() })}
          >
            Place
          </button>
        </div>

        <h3 className="fill-heading">Ticks &amp; crosses</h3>
        <div className="fill-marks">
          <button
            type="button"
            className={`fill-mark-btn ${armed?.kind === "mark" && armed.mark === "check" ? "armed" : ""}`}
            onClick={() =>
              setArmed(armed?.kind === "mark" && armed.mark === "check" ? null : { kind: "mark", mark: "check" })
            }
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4,13 10,19 20,5" />
            </svg>
            Tick
          </button>
          <button
            type="button"
            className={`fill-mark-btn ${armed?.kind === "mark" && armed.mark === "cross" ? "armed" : ""}`}
            onClick={() =>
              setArmed(armed?.kind === "mark" && armed.mark === "cross" ? null : { kind: "mark", mark: "cross" })
            }
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="5,5 19,19" />
              <polyline points="19,5 5,19" />
            </svg>
            Cross
          </button>
        </div>

        <h3 className="fill-heading">Pen — circle or underline</h3>
        <div className="fill-pen">
          <button
            type="button"
            className={`fill-pen-toggle ${drawMode ? "on" : ""}`}
            onClick={() => setDrawMode((d) => !d)}
          >
            {drawMode ? "Drawing — click to stop" : "Draw on the document"}
          </button>
          <div className="fill-pen-colors">
            {PEN_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`fill-pen-color ${penColor === c ? "on" : ""}`}
                style={{ background: c }}
                aria-label={`Pen colour ${c}`}
                onClick={() => {
                  setPenColor(c);
                  setDrawMode(true);
                }}
              />
            ))}
          </div>
        </div>
        {placements.some((p) => p.kind === "ink") && (
          <button
            type="button"
            className="fill-clear"
            onClick={() =>
              setPlacements((ps) => {
                const lastInk = [...ps].reverse().find((p) => p.kind === "ink");
                return lastInk ? ps.filter((p) => p.id !== lastInk.id) : ps;
              })
            }
          >
            Undo last drawing
          </button>
        )}
        {drawMode && (
          <p className="fill-armed-note">
            Draw on the document to circle or underline an option.{" "}
            <button type="button" onClick={() => setDrawMode(false)}>
              Done
            </button>
          </p>
        )}

        <h3 className="fill-heading">Signature or initials</h3>
        {savedSig && (
          <button
            type="button"
            className={`fill-chip fill-sig-chip ${armed?.kind === "image" ? "armed" : ""}`}
            onClick={() =>
              setArmed(
                armed?.kind === "image"
                  ? null
                  : { kind: "image", dataUrl: savedSig.dataUrl, aspect: savedSig.aspect }
              )
            }
          >
            <span className="fill-chip-label">Place saved signature</span>
            <img src={savedSig.dataUrl} alt="saved signature" className="fill-sig-thumb" />
          </button>
        )}
        <SignaturePad onUse={useSignature} />

        {armed && (
          <p className="fill-armed-note">
            Click on the document to place{" "}
            <strong>
              {armed.kind === "text"
                ? `“${truncate(armed.text, 28)}”`
                : armed.kind === "mark"
                  ? `a ${armed.mark === "check" ? "tick" : "cross"}`
                  : "your signature"}
            </strong>
            .{" "}
            <button type="button" onClick={() => setArmed(null)}>
              Cancel
            </button>
          </p>
        )}

        {selected && (
          <div className="fill-selected">
            <h3 className="fill-heading">
              Selected:{" "}
              {selected.kind === "image"
                ? "signature"
                : selected.kind === "ink"
                  ? "drawing"
                  : selected.kind === "mark"
                    ? selected.mark === "check"
                      ? "tick"
                      : "cross"
                    : `“${truncate(selected.text ?? "", 24)}”`}
            </h3>
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
