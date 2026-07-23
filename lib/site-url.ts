import { headers } from "next/headers";

// Derives the current request's origin instead of needing a separate env
// var to keep in sync across local dev, preview deploys, and production.
export async function getSiteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
