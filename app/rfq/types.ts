export interface RfqItem {
  id: string;
  description: string;
  quantity: string;
}

export function emptyItem(): RfqItem {
  return { id: crypto.randomUUID(), description: "", quantity: "" };
}

// Tolerates whatever came back from jsonb, including older/partial shapes
// (earlier versions stored a separate "unit" field, now folded into the
// description text instead).
export function normaliseItems(raw: unknown): RfqItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => {
      const description = typeof item.description === "string" ? item.description : "";
      const unit = typeof item.unit === "string" ? item.unit.trim() : "";
      return {
        id: typeof item.id === "string" ? item.id : crypto.randomUUID(),
        description: unit ? `${description} (${unit})` : description,
        quantity: typeof item.quantity === "string" ? item.quantity : "",
      };
    });
}
