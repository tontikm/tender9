import type { RfqItem } from "./types";

const NUMBER = /^\d+(\.\d+)?$/;

// Best-effort parse of one pasted line into description/quantity/unit. Users
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
    return { id, description: tabParts[0], quantity: tabParts[1] ?? "", unit: tabParts[2] ?? "" };
  }

  // "Widget ABC, 10, units" or "10, Widget ABC, units"
  const commaParts = line.split(",").map((p) => p.trim()).filter(Boolean);
  if (commaParts.length >= 2) {
    if (NUMBER.test(commaParts[0])) {
      return { id, description: commaParts[1] ?? "", quantity: commaParts[0], unit: commaParts[2] ?? "" };
    }
    if (NUMBER.test(commaParts[1])) {
      return { id, description: commaParts[0], quantity: commaParts[1], unit: commaParts[2] ?? "" };
    }
  }

  // "10 x Widget ABC"
  const leading = line.match(/^(\d+(?:\.\d+)?)\s*x\s+(.+)$/i);
  if (leading) {
    return { id, description: leading[2].trim(), quantity: leading[1], unit: "" };
  }

  // "Widget ABC   10 units" / "Widget ABC 10"
  const trailing = line.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*([a-zA-Z]{1,12})?$/);
  if (trailing) {
    return { id, description: trailing[1].trim(), quantity: trailing[2], unit: trailing[3] ?? "" };
  }

  return { id, description: line, quantity: "", unit: "" };
}

export function parseItemLines(text: string): RfqItem[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseItemLine);
}
