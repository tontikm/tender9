import type { PDFFont, PDFPage } from "pdf-lib";

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const bin = atob(dataUrl.split(",")[1] ?? "");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function hexToRgb01(hex: string): [number, number, number] {
  const n = hex.replace("#", "");
  return [
    parseInt(n.slice(0, 2), 16) / 255,
    parseInt(n.slice(2, 4), 16) / 255,
    parseInt(n.slice(4, 6), 16) / 255,
  ];
}

// pdf-lib's standard fonts use WinAnsi encoding — map smart punctuation to
// safe equivalents and replace anything else they can't encode. Every piece
// of free text (typed or pasted) that ends up in a PDF must go through this
// before drawText, or pdf-lib throws at save time.
export function sanitizeForPdf(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "?");
}

export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(test, size) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function drawRight(
  page: PDFPage,
  text: string,
  rightX: number,
  y: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof import("pdf-lib").rgb>
) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: rightX - w, y, size, font, color });
}

// Manually letter-spaced, centered text — used for masthead-style titles
// that should read more like a formal letterhead than plain app UI text.
export function drawTracked(
  page: PDFPage,
  text: string,
  centerX: number,
  y: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof import("pdf-lib").rgb>,
  tracking: number
) {
  const chars = text.split("");
  const totalWidth =
    chars.reduce((w, c) => w + font.widthOfTextAtSize(c, size), 0) + tracking * Math.max(0, chars.length - 1);
  let x = centerX - totalWidth / 2;
  for (const c of chars) {
    page.drawText(c, { x, y, size, font, color });
    x += font.widthOfTextAtSize(c, size) + tracking;
  }
}
