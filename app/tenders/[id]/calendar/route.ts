import { getSupabaseAuthClient, getCurrentUser } from "@/lib/supabase-auth";
import { extractRequirements } from "@/lib/requirements";
import { displayTitle } from "@/lib/tender-text";

export const dynamic = "force-dynamic";

interface TenderRow {
  title: string;
  description: string | null;
  buyer_name: string | null;
  briefing_date: string | null;
  raw_payload: unknown;
}

// RFC 5545 text escaping for property values.
function icsEscape(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// ISO timestamp -> iCalendar UTC form (YYYYMMDDTHHMMSSZ).
function toIcsUtc(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function safeName(text: string): string {
  return text.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "briefing";
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const supabase = await getSupabaseAuthClient();
  const { data: tender } = await supabase
    .from("tenders")
    .select("title, description, buyer_name, briefing_date, raw_payload")
    .eq("id", id)
    .maybeSingle<TenderRow>();

  if (!tender) return new Response("Tender not found", { status: 404 });
  if (!tender.briefing_date) {
    return new Response("This tender has no briefing session", { status: 404 });
  }

  const requirements = extractRequirements(tender.raw_payload);
  const venue = requirements.briefing?.venue ?? "";
  const compulsory = requirements.briefing?.compulsory;

  const startMs = new Date(tender.briefing_date).getTime();
  const start = toIcsUtc(tender.briefing_date);
  const end = toIcsUtc(new Date(startMs + 60 * 60 * 1000).toISOString());

  const descriptionParts = [
    compulsory ? "COMPULSORY briefing. Attendance is mandatory." : "Briefing session.",
    tender.buyer_name ? `Buyer: ${tender.buyer_name}.` : "",
    "Reminder added from Tender9.",
  ].filter(Boolean);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Tender9//Tender briefing//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:briefing-${id}@tender9`,
    `DTSTAMP:${toIcsUtc(new Date().toISOString())}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${icsEscape(`Tender briefing: ${displayTitle(tender, 100)}`)}`,
    venue ? `LOCATION:${icsEscape(venue)}` : "",
    `DESCRIPTION:${icsEscape(descriptionParts.join(" "))}`,
    "BEGIN:VALARM",
    "TRIGGER:-P1D",
    "ACTION:DISPLAY",
    "DESCRIPTION:Tender briefing tomorrow",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);

  return new Response(lines.join("\r\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="briefing-${safeName(tender.title)}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
