"use client";

import { useRef, useState } from "react";

const W = 258;
const H = 90;

// Draw-anywhere signature pad. On "Use" it crops to the drawn area and hands
// back a transparent PNG data URL plus its aspect ratio, ready to place.
export function SignaturePad({ onUse }: { onUse: (dataUrl: string, aspect: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const bounds = useRef({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  const [hasInk, setHasInk] = useState(false);

  const toCanvas = (e: React.PointerEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  };

  const start = (e: React.PointerEvent) => {
    drawing.current = true;
    last.current = toCanvas(e);
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const move = (e: React.PointerEvent) => {
    if (!drawing.current || !last.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = toCanvas(e);
    ctx.strokeStyle = "#141414";
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    const b = bounds.current;
    b.minX = Math.min(b.minX, last.current.x, p.x);
    b.maxX = Math.max(b.maxX, last.current.x, p.x);
    b.minY = Math.min(b.minY, last.current.y, p.y);
    b.maxY = Math.max(b.maxY, last.current.y, p.y);
    last.current = p;
    if (!hasInk) setHasInk(true);
  };

  const end = () => {
    drawing.current = false;
    last.current = null;
  };

  const clear = () => {
    const c = canvasRef.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    bounds.current = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    setHasInk(false);
  };

  const use = () => {
    if (!hasInk) return;
    const c = canvasRef.current!;
    const b = bounds.current;
    const pad = 8;
    const x = Math.max(0, b.minX - pad);
    const y = Math.max(0, b.minY - pad);
    const w = Math.min(c.width - x, b.maxX - b.minX + pad * 2);
    const h = Math.min(c.height - y, b.maxY - b.minY + pad * 2);
    const tmp = document.createElement("canvas");
    tmp.width = Math.max(1, Math.round(w));
    tmp.height = Math.max(1, Math.round(h));
    tmp.getContext("2d")!.drawImage(c, x, y, w, h, 0, 0, tmp.width, tmp.height);
    onUse(tmp.toDataURL("image/png"), tmp.width / tmp.height);
  };

  return (
    <div className="sig-pad">
      <canvas
        ref={canvasRef}
        width={W * 2}
        height={H * 2}
        style={{ width: W, height: H }}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <div className="sig-pad-actions">
        <button type="button" onClick={clear} disabled={!hasInk}>
          Clear
        </button>
        <button type="button" className="sig-use" onClick={use} disabled={!hasInk}>
          Use signature
        </button>
      </div>
    </div>
  );
}
