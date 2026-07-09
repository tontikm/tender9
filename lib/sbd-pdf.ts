// Renders a BidPack (from lib/sbd.ts) into a downloadable PDF. Same content
// as the on-screen bid-pack page, drawn with pdf-lib so it's a genuine
// one-click download rather than a browser "print to PDF".

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { BidPack, SbdForm } from "./sbd";

const PAGE = { width: 595.28, height: 841.89 }; // A4 in points
const MARGIN = 50;
const CONTENT_WIDTH = PAGE.width - MARGIN * 2;

const INK = rgb(0.1, 0.13, 0.15);
const MUTED = rgb(0.36, 0.43, 0.45);
const RULE = rgb(0.82, 0.86, 0.86);

// pdf-lib's standard fonts use WinAnsi (CP1252). Map the smart punctuation our
// content can contain to safe equivalents so encoding never throws.
function sanitize(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[–]/g, "-");
}

class Writer {
  page: PDFPage;
  y: number;

  constructor(
    private doc: PDFDocument,
    private font: PDFFont,
    private bold: PDFFont
  ) {
    this.page = doc.addPage([PAGE.width, PAGE.height]);
    this.y = PAGE.height - MARGIN;
  }

  private newPage() {
    this.page = this.doc.addPage([PAGE.width, PAGE.height]);
    this.y = PAGE.height - MARGIN;
  }

  private need(space: number) {
    if (this.y - space < MARGIN) this.newPage();
  }

  gap(h: number) {
    this.y -= h;
  }

  pageBreak() {
    this.newPage();
  }

  private wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
    const lines: string[] = [];
    for (const rawLine of text.split("\n")) {
      const words = rawLine.split(/\s+/).filter(Boolean);
      let line = "";
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
          lines.push(line);
          line = word;
        } else {
          line = candidate;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  text(
    content: string,
    opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; indent?: number } = {}
  ) {
    const { size = 10.5, bold = false, color = INK, indent = 0 } = opts;
    const font = bold ? this.bold : this.font;
    const lineHeight = size * 1.4;
    const lines = this.wrap(sanitize(content), font, size, CONTENT_WIDTH - indent);
    for (const line of lines) {
      this.need(lineHeight);
      this.page.drawText(line, { x: MARGIN + indent, y: this.y - size, size, font, color });
      this.y -= lineHeight;
    }
  }

  rule() {
    this.need(8);
    this.page.drawLine({
      start: { x: MARGIN, y: this.y - 2 },
      end: { x: PAGE.width - MARGIN, y: this.y - 2 },
      thickness: 0.75,
      color: RULE,
    });
    this.y -= 8;
  }

  field(label: string, value: string | null) {
    this.text(label, { size: 8.5, bold: true, color: MUTED });
    this.gap(1);
    this.text(value && value.trim() ? value : "—", { size: 10.5 });
    this.gap(6);
  }

  async bytes(): Promise<Uint8Array> {
    return this.doc.save();
  }
}

function drawForm(w: Writer, form: SbdForm) {
  w.pageBreak();
  w.text(`${form.code} — ${form.title}`, { size: 14, bold: true });
  w.rule();
  w.gap(4);

  if (form.intro) {
    w.text(form.intro, { size: 9.5, color: MUTED });
    w.gap(8);
  }

  for (const section of form.sections) {
    w.text(section.heading.toUpperCase(), { size: 9, bold: true, color: MUTED });
    w.gap(4);
    for (const f of section.fields) {
      w.field(f.label, f.value);
    }
    w.gap(4);
  }

  if (form.questions && form.questions.length > 0) {
    w.text("DECLARATIONS — TICK ONE PER STATEMENT", { size: 9, bold: true, color: MUTED });
    w.gap(4);
    form.questions.forEach((q, i) => {
      w.text(`${i + 1}. ${q}`, { size: 10 });
      w.text("[  ] Yes      [  ] No", { size: 10, indent: 14 });
      w.gap(6);
    });
  }

  if (form.manualNotes && form.manualNotes.length > 0) {
    w.gap(2);
    w.text("To complete by hand", { size: 9, bold: true, color: MUTED });
    w.gap(3);
    for (const note of form.manualNotes) {
      w.text(`•  ${note}`, { size: 9.5, indent: 4 });
      w.gap(2);
    }
    w.gap(4);
  }

  if (form.declaration) {
    w.gap(4);
    w.text(form.declaration, { size: 9.5 });
    w.gap(20);
    w.text("Signature: ______________________________        Date: ____________________", {
      size: 10,
    });
  }
}

export async function renderBidPackPdf(pack: BidPack): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Bid pack — ${pack.tender.title}`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(doc, font, bold);

  // Cover
  w.text("SBD BID PACK", { size: 9, bold: true, color: MUTED });
  w.gap(4);
  w.text(pack.company.legal_name || "Your company", { size: 20, bold: true });
  w.gap(10);
  w.rule();
  w.gap(6);
  w.field("Tender", pack.tender.title);
  w.field("Description", pack.tender.description);
  w.field("Organ of state", pack.tender.buyer_name);
  w.field("Generated", pack.generatedOn);
  w.field("Forms included", pack.forms.map((f) => f.code).join(", "));
  w.gap(8);
  w.text(
    "Pre-filled from your saved company profile as a working document. Check every field against the official tender document, complete any items marked “to complete by hand”, then sign and submit. This is an aid, not a substitute for the organ of state's official forms where those are required.",
    { size: 8.5, color: MUTED }
  );

  for (const form of pack.forms) {
    drawForm(w, form);
  }

  return w.bytes();
}
