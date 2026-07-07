export function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-ZA");
}

export function formatValue(amount: number | null, currency: string | null): string {
  if (amount == null || amount === 0) return "—";
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: currency ?? "ZAR",
    maximumFractionDigits: 0,
  }).format(amount);
}
