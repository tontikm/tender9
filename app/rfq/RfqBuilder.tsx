"use client";

import { useState, useTransition } from "react";
import type { PDFFont, PDFPage } from "pdf-lib";
import type { CompanyProfile } from "../company/CompanyForm";
import { emptyItem, normaliseItems, type RfqItem } from "./types";
import { parseItemLines } from "./parse-items";
import { saveRfq, deleteRfq } from "./actions";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 54;
const CONTENT_W = PAGE_W - MARGIN * 2;
const ACCENT_BAR_H = 6;
const QTY_COL_W = 70;
const DESC_COL_W = CONTENT_W - QTY_COL_W - 14;
const TABLE_HEADER_H = 22;

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const bin = atob(dataUrl.split(",")[1] ?? "");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Lets a company's address be typed without spaces after commas (common
// when pasted from elsewhere) and still wrap cleanly in the PDF.
function normaliseAddress(address: string): string {
  return address.replace(/,(?=\S)/g, ", ").replace(/\s+/g, " ").trim();
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
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

function drawRight(
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

// Manually letter-spaced, centered text — used once for the document title,
// to read more like a formal letterhead masthead than plain app UI text.
function drawTracked(
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

function todayFormatted(): string {
  return new Date().toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
}

function dateFormatted(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
}

export interface ExistingRfq {
  id: string;
  title: string;
  recipient_name: string | null;
  recipient_email: string | null;
  due_date: string | null;
  notes: string | null;
  items: unknown;
  tender_id: string | null;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function RfqBuilder({
  company,
  tenderId,
  existing,
}: {
  company: CompanyProfile | null;
  tenderId: string | null;
  existing: ExistingRfq | null;
}) {
  const [rfqId] = useState(() => existing?.id ?? crypto.randomUUID());
  const [title, setTitle] = useState(existing?.title ?? "Request for Quotation");
  const [recipientName, setRecipientName] = useState(existing?.recipient_name ?? "");
  const [recipientEmail, setRecipientEmail] = useState(existing?.recipient_email ?? "");
  const [dueDate, setDueDate] = useState(existing?.due_date ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [items, setItems] = useState<RfqItem[]>(() => normaliseItems(existing?.items));
  const [pasteText, setPasteText] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const handleAddPasted = () => {
    const parsed = parseItemLines(pasteText);
    if (parsed.length === 0) return;
    setItems((prev) => [...prev, ...parsed]);
    setPasteText("");
  };

  const addBlankRow = () => setItems((prev) => [...prev, emptyItem()]);
  const removeItem = (id: string) => setItems((prev) => prev.filter((it) => it.id !== id));
  const updateItem = (id: string, field: keyof Omit<RfqItem, "id">, value: string) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, [field]: value } : it)));

  const handleSave = () => {
    setSaveStatus("saving");
    startTransition(async () => {
      const res = await saveRfq({
        id: rfqId,
        tenderId,
        title,
        recipientName,
        recipientEmail,
        dueDate,
        notes,
        items,
      });
      setSaveStatus(res.ok ? "saved" : "error");
      if (res.ok) setTimeout(() => setSaveStatus("idle"), 3000);
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      await deleteRfq(rfqId);
      window.location.href = tenderId ? `/tenders/${tenderId}/workspace` : "/rfq";
    });
  };

  const generatePdf = async () => {
    setGenerating(true);
    setError(null);
    try {
      const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const bold = await doc.embedFont(StandardFonts.HelveticaBold);
      const serifBold = await doc.embedFont(StandardFonts.TimesRomanBold);
      const serifItalic = await doc.embedFont(StandardFonts.TimesRomanItalic);

      const ink = rgb(0.08, 0.09, 0.11);
      const accent = rgb(0.09, 0.13, 0.2);
      const muted = rgb(0.4, 0.44, 0.5);
      const hairline = rgb(0.82, 0.84, 0.87);
      const zebra = rgb(0.965, 0.968, 0.975);
      const onAccent = rgb(1, 1, 1);

      const drawAccentBar = (p: PDFPage) => {
        p.drawRectangle({ x: 0, y: PAGE_H - ACCENT_BAR_H, width: PAGE_W, height: ACCENT_BAR_H, color: accent });
      };

      let logoImage: Awaited<ReturnType<typeof doc.embedPng>> | null = null;
      let logoW = 0;
      let logoH = 0;
      if (company?.logo_data_url) {
        try {
          const bytes = dataUrlToBytes(company.logo_data_url);
          logoImage = company.logo_data_url.includes("image/jpeg")
            ? await doc.embedJpg(bytes)
            : await doc.embedPng(bytes);
          const maxW = 130;
          const maxH = 56;
          const ratio = Math.min(maxW / logoImage.width, maxH / logoImage.height, 1);
          logoW = logoImage.width * ratio;
          logoH = logoImage.height * ratio;
        } catch {
          logoImage = null;
        }
      }

      const companyName = company?.trading_name || company?.legal_name || "";
      const addressLine = company?.physical_address ? normaliseAddress(company.physical_address) : "";
      const companyDetailLines = [
        addressLine,
        [company?.contact_email, company?.contact_phone].filter(Boolean).join("  ·  "),
        company?.vat_number ? `VAT: ${company.vat_number}` : "",
      ].filter(Boolean);

      let page = doc.addPage([PAGE_W, PAGE_H]);
      drawAccentBar(page);
      let y = PAGE_H - ACCENT_BAR_H - 34;

      if (logoImage) {
        page.drawImage(logoImage, { x: MARGIN, y: y - logoH + 12, width: logoW, height: logoH });
      }

      let cy = y;
      if (companyName) {
        wrapText(companyName, serifBold, 14, 240).forEach((wl) => {
          cy -= 14;
          drawRight(page, wl, PAGE_W - MARGIN, cy, serifBold, 14, ink);
          cy -= 2;
        });
      }
      companyDetailLines.forEach((line) => {
        wrapText(line, font, 8.5, 240).forEach((wl) => {
          cy -= 12;
          drawRight(page, wl, PAGE_W - MARGIN, cy, font, 8.5, muted);
        });
      });

      y = Math.min(y - logoH - 12, cy) - 22;

      page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1.3, color: accent });
      y -= 34;

      drawTracked(page, "REQUEST FOR QUOTATION", PAGE_W / 2, y, serifBold, 19, ink, 1.6);
      y -= 10;
      page.drawLine({
        start: { x: PAGE_W / 2 - 44, y },
        end: { x: PAGE_W / 2 + 44, y },
        thickness: 1,
        color: accent,
      });
      y -= 30;

      const labelSize = 8;
      const valueSize = 10;

      let leftY = y;
      const leftEntries: [string, string][] = [
        ["Reference", title || "Request for Quotation"],
        ["Date issued", todayFormatted()],
        ["Quotes needed by", dueDate ? dateFormatted(dueDate) : "—"],
      ];
      leftEntries.forEach(([label, value]) => {
        page.drawText(label.toUpperCase(), { x: MARGIN, y: leftY, size: labelSize, font: bold, color: accent });
        leftY -= 12;
        page.drawText(value, { x: MARGIN, y: leftY, size: valueSize, font, color: ink });
        leftY -= 18;
      });

      let rightY = y;
      drawRight(page, "PREPARED FOR", PAGE_W - MARGIN, rightY, bold, labelSize, accent);
      rightY -= 12;
      drawRight(page, recipientName || "(supplier name not set)", PAGE_W - MARGIN, rightY, font, valueSize, ink);
      rightY -= 18;
      if (recipientEmail) {
        drawRight(page, recipientEmail, PAGE_W - MARGIN, rightY, font, 9, muted);
        rightY -= 14;
      }

      y = Math.min(leftY, rightY) - 6;
      page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.6, color: hairline });
      y -= 24;

      const drawTableHeader = () => {
        page.drawRectangle({ x: MARGIN, y: y - TABLE_HEADER_H, width: CONTENT_W, height: TABLE_HEADER_H, color: accent });
        page.drawText("DESCRIPTION", { x: MARGIN + 10, y: y - TABLE_HEADER_H + 7, size: 9, font: bold, color: onAccent });
        drawRight(page, "QTY", PAGE_W - MARGIN - 10, y - TABLE_HEADER_H + 7, bold, 9, onAccent);
        y -= TABLE_HEADER_H + 12;
      };

      drawTableHeader();

      items.forEach((item, index) => {
        const descLines = wrapText(item.description || "—", font, 9.5, DESC_COL_W);
        const rowHeight = Math.max(1, descLines.length) * 13 + 8;

        if (y - rowHeight < MARGIN + 100) {
          page = doc.addPage([PAGE_W, PAGE_H]);
          drawAccentBar(page);
          y = PAGE_H - ACCENT_BAR_H - 30;
          page.drawText(`${companyName ? `${companyName} · ` : ""}Request for Quotation (continued)`, {
            x: MARGIN,
            y,
            size: 11,
            font: serifBold,
            color: ink,
          });
          y -= 24;
          drawTableHeader();
        }

        if (index % 2 === 1) {
          page.drawRectangle({ x: MARGIN, y: y - rowHeight + 4, width: CONTENT_W, height: rowHeight, color: zebra });
        }

        let rowY = y - 11;
        descLines.forEach((line) => {
          page.drawText(line, { x: MARGIN + 10, y: rowY, size: 9.5, font, color: ink });
          rowY -= 13;
        });
        drawRight(page, item.quantity || "—", PAGE_W - MARGIN - 10, y - 11, font, 9.5, ink);

        y -= rowHeight;
      });

      page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1.3, color: accent });
      y -= 26;

      if (notes.trim()) {
        page.drawText("NOTES", { x: MARGIN, y, size: labelSize, font: bold, color: accent });
        y -= 14;
        wrapText(notes, font, 9.5, CONTENT_W).forEach((line) => {
          if (y < MARGIN + 70) {
            page = doc.addPage([PAGE_W, PAGE_H]);
            drawAccentBar(page);
            y = PAGE_H - ACCENT_BAR_H - 34;
          }
          page.drawText(line, { x: MARGIN, y, size: 9.5, font, color: ink });
          y -= 13;
        });
        y -= 14;
      }

      const contactLine = [company?.contact_email, company?.contact_phone].filter(Boolean).join(" or ");
      const closing = contactLine
        ? `Please submit your quotation to ${contactLine}${dueDate ? ` by ${dateFormatted(dueDate)}` : ""}.`
        : dueDate
          ? `Please submit your quotation by ${dateFormatted(dueDate)}.`
          : "";
      if (closing) {
        wrapText(closing, font, 9.5, CONTENT_W).forEach((line) => {
          page.drawText(line, { x: MARGIN, y, size: 9.5, font, color: ink });
          y -= 13;
        });
        y -= 14;
      }

      if (company?.signatory_name) {
        page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + 160, y }, thickness: 0.8, color: hairline });
        y -= 15;
        page.drawText(company.signatory_name, { x: MARGIN, y, size: 10.5, font: serifItalic, color: ink });
        if (company.signatory_capacity) {
          y -= 13;
          page.drawText(company.signatory_capacity, { x: MARGIN, y, size: 8.5, font, color: muted });
        }
      }

      const allPages = doc.getPages();
      const footerName = companyName.toUpperCase();
      allPages.forEach((p, i) => {
        p.drawLine({
          start: { x: MARGIN, y: MARGIN - 8 },
          end: { x: PAGE_W - MARGIN, y: MARGIN - 8 },
          thickness: 0.6,
          color: hairline,
        });
        if (footerName) {
          p.drawText(footerName, { x: MARGIN, y: MARGIN - 20, size: 7.5, font: bold, color: muted });
        }
        if (allPages.length > 1) {
          drawRight(p, `Page ${i + 1} of ${allPages.length}`, PAGE_W - MARGIN, MARGIN - 20, font, 7.5, muted);
        }
      });

      const out = await doc.save({ useObjectStreams: false });
      const blob = new Blob([out as unknown as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `RFQ-${(title || "request-for-quotation").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setError(`Could not generate the PDF: ${e instanceof Error ? e.message : String(e)}`);
    }
    setGenerating(false);
  };

  return (
    <div className="rfq-layout">
      <div className="rfq-main-col">
        <section className="form-section">
          <h3 className="form-section-heading">Paste your item list</h3>
          <p className="hint">
            One item per line, quantities are picked up automatically. For example &quot;10 x Steel
            pipes&quot; or rows pasted straight from a spreadsheet. Fix anything after, it&apos;s all
            editable below.
          </p>
          <textarea
            className="rfq-paste"
            rows={5}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={"10 x Steel pipes 40mm\n25 bags of cement 42.5N\nSafety helmets  15  each"}
          />
          <button type="button" className="btn" onClick={handleAddPasted} disabled={!pasteText.trim()}>
            Add to quote
          </button>
        </section>

        <section className="form-section">
          <div className="rfq-table-heading">
            <h3 className="form-section-heading">Items to quote</h3>
            <button type="button" className="btn" onClick={addBlankRow}>
              + Add item
            </button>
          </div>

          {items.length === 0 ? (
            <p className="empty-state">No items yet. Paste a list above, or add one manually.</p>
          ) : (
            <table className="rfq-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Qty</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <input
                        value={item.description}
                        onChange={(e) => updateItem(item.id, "description", e.target.value)}
                        placeholder="Item description"
                      />
                    </td>
                    <td>
                      <input
                        className="rfq-qty-input"
                        value={item.quantity}
                        onChange={(e) => updateItem(item.id, "quantity", e.target.value)}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="rfq-remove-row"
                        aria-label={`Remove ${item.description || "item"}`}
                        onClick={() => removeItem(item.id)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <aside className="rfq-side">
        <section className="form-section">
          <h3 className="form-section-heading">Quote details</h3>
          <div className="form-grid">
            <div className="form-field full">
              <label htmlFor="rfq-title">Reference / title</label>
              <input id="rfq-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="form-field">
              <label htmlFor="rfq-recipient">Supplier name</label>
              <input
                id="rfq-recipient"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="e.g. ABC Hardware"
              />
            </div>
            <div className="form-field">
              <label htmlFor="rfq-email">Supplier email</label>
              <input
                id="rfq-email"
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="rfq-due">Quotes needed by</label>
              <input id="rfq-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="form-field full">
              <label htmlFor="rfq-notes">Notes / terms</label>
              <textarea
                id="rfq-notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. delivery address, validity period, payment terms"
              />
            </div>
          </div>
        </section>

        {!company?.logo_data_url && (
          <p className="rfq-logo-hint">
            Add your company logo on the <a href="/company">Company profile</a> page to have it appear
            on the quote.
          </p>
        )}

        {error && <p className="auth-error">{error}</p>}

        <div className="rfq-actions">
          <button type="button" className="btn-primary" onClick={generatePdf} disabled={generating || items.length === 0}>
            {generating ? "Generating…" : "Download PDF"}
          </button>
          <button type="button" className="btn" onClick={handleSave} disabled={saveStatus === "saving"}>
            {saveStatus === "saving" ? "Saving…" : "Save to workspace"}
          </button>
          {existing && (
            <button type="button" className="rfq-delete" onClick={handleDelete}>
              Delete
            </button>
          )}
        </div>
        {saveStatus === "saved" && <p className="rfq-save-status">Saved</p>}
        {saveStatus === "error" && <p className="rfq-save-status error">Couldn&apos;t save</p>}
      </aside>
    </div>
  );
}
