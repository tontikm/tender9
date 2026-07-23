// Base64 encodes 3 bytes as 4 characters, so decoded size is roughly 3/4 of
// the string length (minus any "data:...;base64," prefix before the comma).
export function estimateBase64Bytes(value: string): number {
  const base64 = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  return Math.ceil((base64.length * 3) / 4);
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// Logos are resized to ~400px and re-encoded as PNG client-side before the
// form ever submits, so a legitimate one is a few hundred KB at most — this
// is a backstop against a request that bypasses the client-side resize.
export const MAX_LOGO_BYTES = 3 * 1024 * 1024;

// Uploaded/scanned PDFs (not tender documents, which are re-fetched from
// their source and never stored here) can legitimately run to several MB.
export const MAX_FILL_PDF_BYTES = 10 * 1024 * 1024;

// A pasted item list is plain text — no legitimate RFQ needs megabytes of it.
export const MAX_RFQ_ITEMS_BYTES = 300 * 1024;

export function checkBase64Size(value: string, maxBytes: number, label: string): string | null {
  if (estimateBase64Bytes(value) > maxBytes) {
    return `${label} is too large (max ${formatMb(maxBytes)}).`;
  }
  return null;
}
