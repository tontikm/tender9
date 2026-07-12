"use client";

import { useState, useTransition } from "react";
import type { PDFFont, PDFPage } from "pdf-lib";
import type { CompanyProfile } from "../company/CompanyForm";
import { emptyItem, normaliseItems, type RfqItem } from "./types";
import { parseItemLines } from "./parse-items";
import { saveRfq, deleteRfq } from "./actions";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 50;
const CONTENT_W = PAGE_W - MARGIN * 2;
const COL_DESC_X = MARGIN;
const COL_DESC_W = 335;
const COL_QTY_X = MARGIN + 345;
const COL_UNIT_X = MARGIN + 415;

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const bin = atob(dataUrl.split(",")[1] ?? "");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
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
      const textColor = rgb(0.11, 0.14, 0.15);
      const mutedColor = rgb(0.36, 0.44, 0.45);
      const lineColor = rgb(0.78, 0.82, 0.82);
      const zebraColor = rgb(0.96, 0.97, 0.97);

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
          const maxH = 60;
          const ratio = Math.min(maxW / logoImage.width, maxH / logoImage.height, 1);
          logoW = logoImage.width * ratio;
          logoH = logoImage.height * ratio;
        } catch {
          logoImage = null;
        }
      }

      const companyLines = [
        company?.trading_name || company?.legal_name || "",
        company?.physical_address ?? "",
        [company?.contact_email, company?.contact_phone].filter(Boolean).join("  ·  "),
        company?.vat_number ? `VAT: ${company.vat_number}` : "",
      ].filter(Boolean);

      let page = doc.addPage([PAGE_W, PAGE_H]);
      let y = PAGE_H - MARGIN;

      if (logoImage) {
        page.drawImage(logoImage, { x: MARGIN, y: y - logoH, width: logoW, height: logoH });
      }

      let cy = y;
      companyLines.forEach((line, i) => {
        const isName = i === 0;
        const size = isName ? 12 : 9;
        const f = isName ? bold : font;
        const wrapped = wrapText(line, f, size, 220);
        wrapped.forEach((wl) => {
          cy -= size;
          drawRight(page, wl, PAGE_W - MARGIN, cy, f, size, isName ? textColor : mutedColor);
          cy -= 3;
        });
      });

      y = Math.min(y - logoH, cy) - 24;

      const titleSize = 17;
      const titleText = "REQUEST FOR QUOTATION";
      const titleWidth = bold.widthOfTextAtSize(titleText, titleSize);
      page.drawText(titleText, { x: (PAGE_W - titleWidth) / 2, y, size: titleSize, font: bold, color: textColor });
      y -= 28;

      const metaSize = 10;
      let leftY = y;
      [`Reference: ${title || "Request for Quotation"}`, `Date issued: ${todayFormatted()}`, `Quotes needed by: ${dueDate ? dateFormatted(dueDate) : "—"}`].forEach(
        (line) => {
          page.drawText(line, { x: MARGIN, y: leftY, size: metaSize, font, color: textColor });
          leftY -= 14;
        }
      );

      let rightY = y;
      const rightLines = [
        recipientName ? `To: ${recipientName}` : "To: (supplier name not set)",
        recipientEmail,
      ].filter(Boolean);
      rightLines.forEach((line) => {
        drawRight(page, line, PAGE_W - MARGIN, rightY, font, metaSize, textColor);
        rightY -= 14;
      });

      y = Math.min(leftY, rightY) - 12;

      const drawTableHeader = () => {
        page.drawText("Description", { x: COL_DESC_X, y, size: 10, font: bold, color: textColor });
        page.drawText("Qty", { x: COL_QTY_X, y, size: 10, font: bold, color: textColor });
        page.drawText("Unit", { x: COL_UNIT_X, y, size: 10, font: bold, color: textColor });
        y -= 6;
        page.drawLine({
          start: { x: MARGIN, y },
          end: { x: PAGE_W - MARGIN, y },
          thickness: 1,
          color: lineColor,
        });
        y -= 16;
      };

      drawTableHeader();

      items.forEach((item, index) => {
        const descLines = wrapText(item.description || "—", font, 9.5, COL_DESC_W);
        const rowHeight = Math.max(1, descLines.length) * 13 + 6;

        if (y - rowHeight < MARGIN + 60) {
          page = doc.addPage([PAGE_W, PAGE_H]);
          y = PAGE_H - MARGIN;
          page.drawText("Request for Quotation (continued)", {
            x: MARGIN,
            y,
            size: 12,
            font: bold,
            color: textColor,
          });
          y -= 26;
          drawTableHeader();
        }

        if (index % 2 === 1) {
          page.drawRectangle({
            x: MARGIN - 6,
            y: y - rowHeight + 8,
            width: CONTENT_W + 12,
            height: rowHeight,
            color: zebraColor,
          });
        }

        let rowY = y - 10;
        descLines.forEach((line) => {
          page.drawText(line, { x: COL_DESC_X, y: rowY, size: 9.5, font, color: textColor });
          rowY -= 13;
        });
        page.drawText(item.quantity || "—", { x: COL_QTY_X, y: y - 10, size: 9.5, font, color: textColor });
        page.drawText(item.unit || "", { x: COL_UNIT_X, y: y - 10, size: 9.5, font, color: textColor });

        y -= rowHeight;
      });

      page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1, color: lineColor });
      y -= 24;

      if (notes.trim()) {
        page.drawText("Notes:", { x: MARGIN, y, size: 10, font: bold, color: textColor });
        y -= 14;
        wrapText(notes, font, 9.5, CONTENT_W).forEach((line) => {
          if (y < MARGIN + 30) {
            page = doc.addPage([PAGE_W, PAGE_H]);
            y = PAGE_H - MARGIN;
          }
          page.drawText(line, { x: MARGIN, y, size: 9.5, font, color: textColor });
          y -= 13;
        });
        y -= 10;
      }

      const contactLine = [company?.contact_email, company?.contact_phone].filter(Boolean).join(" or ");
      const closing = contactLine
        ? `Please submit your quotation to ${contactLine}${dueDate ? ` by ${dateFormatted(dueDate)}` : ""}.`
        : dueDate
          ? `Please submit your quotation by ${dateFormatted(dueDate)}.`
          : "";
      if (closing) {
        wrapText(closing, font, 9.5, CONTENT_W).forEach((line) => {
          page.drawText(line, { x: MARGIN, y, size: 9.5, font, color: textColor });
          y -= 13;
        });
      }

      if (company?.signatory_name) {
        y -= 8;
        page.drawText(
          `Requested by: ${company.signatory_name}${company.signatory_capacity ? `, ${company.signatory_capacity}` : ""}`,
          { x: MARGIN, y, size: 9.5, font, color: mutedColor }
        );
      }

      const pages = doc.getPages();
      if (pages.length > 1) {
        pages.forEach((p, i) => {
          drawRight(p, `Page ${i + 1} of ${pages.length}`, PAGE_W - MARGIN, MARGIN - 24, font, 8, mutedColor);
        });
      }

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
                  <th>Unit</th>
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
                      <input
                        className="rfq-unit-input"
                        value={item.unit}
                        onChange={(e) => updateItem(item.id, "unit", e.target.value)}
                        placeholder="each"
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
