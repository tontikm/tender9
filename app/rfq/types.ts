export interface RfqItem {
  id: string;
  description: string;
  quantity: string;
  unit: string;
}

export function emptyItem(): RfqItem {
  return { id: crypto.randomUUID(), description: "", quantity: "", unit: "" };
}

// Tolerates whatever came back from jsonb, including older/partial shapes.
export function normaliseItems(raw: unknown): RfqItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => ({
      id: typeof item.id === "string" ? item.id : crypto.randomUUID(),
      description: typeof item.description === "string" ? item.description : "",
      quantity: typeof item.quantity === "string" ? item.quantity : "",
      unit: typeof item.unit === "string" ? item.unit : "",
    }));
}
