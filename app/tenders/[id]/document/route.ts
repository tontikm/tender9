import { type NextRequest } from "next/server";
import { getSupabaseAuthClient } from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";
// The gov document server can be slow — give the fetch room, same as ingest.
export const maxDuration = 60;

// Only ever proxy from the eTenders host, and only URLs that actually belong
// to the requested tender (checked below), so this can't be turned into an
// open relay / SSRF vector.
const ALLOWED_HOST = "www.etenders.gov.za";

// No sign-in check here on purpose: this proxies the same government file
// the (also-public) Download link already points straight at — it's public
// data either way, this just renders it inline for the tender preview.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const index = Number.parseInt(request.nextUrl.searchParams.get("i") ?? "", 10);
  if (!Number.isInteger(index) || index < 0) {
    return new Response("Bad request", { status: 400 });
  }

  const supabase = await getSupabaseAuthClient();
  const { data: tender } = await supabase
    .from("tenders")
    .select("document_urls")
    .eq("id", id)
    .maybeSingle<{ document_urls: string[] | null }>();

  const url = tender?.document_urls?.[index];
  if (!url) return new Response("Document not found", { status: 404 });

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return new Response("Invalid document URL", { status: 400 });
  }
  if (target.hostname !== ALLOWED_HOST) {
    return new Response("Document host not allowed", { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      headers: { "User-Agent": "Tender9/1.0 (+https://tender9.vercel.app)" },
    });
  } catch {
    return new Response("Could not reach the document server", { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    return new Response("Document server returned an error", { status: 502 });
  }

  const headers = new Headers();
  headers.set("Content-Type", upstream.headers.get("content-type") ?? "application/octet-stream");
  // Serve inline so the browser previews it instead of forcing a download
  // (eTenders sends `attachment`, which is why the raw link downloads).
  headers.set("Content-Disposition", "inline");
  const length = upstream.headers.get("content-length");
  if (length) headers.set("Content-Length", length);
  headers.set("Cache-Control", "private, max-age=300");

  return new Response(upstream.body, { status: 200, headers });
}
