import { getSupabaseServerClient } from "./supabase";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MODEL = "claude-sonnet-5";

interface TenderForDraft {
  id: string;
  title: string;
  description: string | null;
  buyer_name: string | null;
  category: string | null;
  province: string | null;
  closing_date: string | null;
  value_estimate: number | null;
  currency: string | null;
}

function buildPrompt(tender: TenderForDraft, companyName: string): string {
  const value =
    tender.value_estimate != null && tender.value_estimate > 0
      ? `${tender.currency ?? "ZAR"} ${tender.value_estimate.toLocaleString()}`
      : "not specified";

  return `You are drafting a short expression-of-interest / cover letter narrative for ${companyName}, a South African supplier, responding to a government tender.

Tender details:
- Title: ${tender.title}
- Buyer: ${tender.buyer_name ?? "Unknown"}
- Category: ${tender.category ?? "Unknown"}
- Province: ${tender.province ?? "National"}
- Estimated value: ${value}
- Closing date: ${tender.closing_date ?? "Unknown"}
- Description: ${tender.description ?? "No further description provided."}

Write a concise (250-400 word) cover letter narrative expressing interest in this tender. Reference the specific buyer and scope by name. Highlight relevant capability in general terms without inventing false claims of past projects, certifications, or experience. This is a starting draft the supplier will personally review and edit before submission — write only the narrative body text, no placeholder brackets like [Company Address] or [Date], no letterhead.`;
}

async function callClaude(prompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not configured. Add it to .env.local (and your Vercel project env vars) to enable draft generation."
    );
  }

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claude API request failed: ${res.status} ${body}`);
  }

  const data = await res.json();
  const content: string = data?.content?.[0]?.text ?? "";
  if (!content) {
    throw new Error("Claude API returned an empty response");
  }

  return content;
}

/**
 * Generates a cover-letter/EOI draft for a tender via the Claude API and
 * upserts it into tender_drafts (one draft per tender; regenerating
 * overwrites the previous one).
 *
 * Claude API failures (including a missing API key) are stored as the
 * draft content itself, prefixed with "⚠️", rather than thrown — so the
 * dashboard can show the failure inline using the same rendering path as
 * a real draft, without a separate error UI.
 */
export async function generateDraftForTender(tenderId: string): Promise<string> {
  const supabase = getSupabaseServerClient();

  const { data: tender, error: tenderError } = await supabase
    .from("tenders")
    .select("id, title, description, buyer_name, category, province, closing_date, value_estimate, currency")
    .eq("id", tenderId)
    .single<TenderForDraft>();

  if (tenderError || !tender) {
    throw new Error(`Tender not found: ${tenderError?.message ?? tenderId}`);
  }

  const { data: profile } = await supabase
    .from("matching_profiles")
    .select("name")
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const companyName = profile?.name ?? "our company";

  let content: string;
  try {
    content = await callClaude(buildPrompt(tender, companyName));
  } catch (err) {
    content = `⚠️ Draft generation failed: ${err instanceof Error ? err.message : String(err)}`;
  }

  const { error: upsertError } = await supabase.from("tender_drafts").upsert(
    {
      tender_id: tenderId,
      content,
      model: MODEL,
      created_at: new Date().toISOString(),
    },
    { onConflict: "tender_id" }
  );

  if (upsertError) throw upsertError;

  return content;
}
