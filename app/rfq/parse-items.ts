import type { RfqItem } from "./types";

const NUMBER = /^\d+(\.\d+)?$/;

// Folds a trailing/extra unit token (e.g. "bags", "each") into the
// description as a parenthetical, rather than keeping a separate column —
// a request for quotation doesn't need one, but the word itself is often
// still meaningful context for the supplier.
function withUnit(description: string, unit?: string): string {
  const trimmed = (unit ?? "").trim();
  return trimmed ? `${description} (${trimmed})` : description;
}

// Best-effort parse of one pasted line into description/quantity. Users
// paste from all sorts of places (spreadsheets, emails, typed lists), so this
// tries the most common shapes in order and falls back to treating the whole
// line as the description — the caller always shows the result in an
// editable table, so a wrong guess here is just a quick manual fix, not a
// dead end.
function parseItemLine(line: string): RfqItem {
  const id = crypto.randomUUID();

  // Pasted from a spreadsheet: columns are tab-separated.
  const tabParts = line.split("\t").map((p) => p.trim()).filter(Boolean);
  if (tabParts.length >= 2) {
    return { id, description: withUnit(tabParts[0], tabParts[2]), quantity: tabParts[1] ?? "" };
  }

  // "Widget ABC, 10, units" or "10, Widget ABC, units"
  const commaParts = line.split(",").map((p) => p.trim()).filter(Boolean);
  if (commaParts.length >= 2) {
    if (NUMBER.test(commaParts[0])) {
      return { id, description: withUnit(commaParts[1] ?? "", commaParts[2]), quantity: commaParts[0] };
    }
    if (NUMBER.test(commaParts[1])) {
      return { id, description: withUnit(commaParts[0], commaParts[2]), quantity: commaParts[1] };
    }
  }

  // "10 x Widget ABC"
  const leading = line.match(/^(\d+(?:\.\d+)?)\s*x\s+(.+)$/i);
  if (leading) {
    return { id, description: leading[2].trim(), quantity: leading[1] };
  }

  // "Widget ABC   10 units" / "Widget ABC 10"
  const trailing = line.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*([a-zA-Z]{1,12})?$/);
  if (trailing) {
    return { id, description: withUnit(trailing[1].trim(), trailing[3]), quantity: trailing[2] };
  }

  return { id, description: line, quantity: "" };
}

export function parseItemLines(text: string): RfqItem[] {
  const rawItems = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseItemLine);

  // A short line with no quantity is usually a stray continuation of the
  // line above — e.g. a spec badge like "AMD EXPO Ready" that wrapped onto
  // its own line when copied from a retailer's page — rather than a
  // genuinely separate item, so fold it into the previous row instead of
  // adding a stray one. (If you do want a standalone item with no
  // quantity, add it with "+ Add item" instead of pasting it.)
  const merged: RfqItem[] = [];
  for (const item of rawItems) {
    const wordCount = item.description.split(/\s+/).filter(Boolean).length;
    const looksLikeContinuation = !item.quantity && wordCount <= 3 && merged.length > 0;
    if (looksLikeContinuation) {
      const prev = merged[merged.length - 1];
      prev.description = `${prev.description} ${item.description}`.trim();
    } else {
      merged.push(item);
    }
  }
  return merged;
}
