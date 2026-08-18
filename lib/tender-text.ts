// `tenders.title` is almost always a bare internal reference code
// ("08/504/26/GAU-PER/1"), while `description` carries the actual readable
// text of what's being procured. Cards and headings across the app should
// lead with description and only fall back to the reference code when no
// description was captured.

// Acronyms worth keeping capitalised when un-shouting an all-caps
// description. Deliberately excludes ambiguous two-letter words like "it"
// and "hr", which are far more often ordinary words than initialisms.
const ACRONYMS =
  /\b(rfq|rfp|rfi|eoi|sbd|tor|ict|sa|sars|cidb|hiv|ppe|gps|cctv|hvac|sla|kzn)\b/gi;

// Kept lowercase mid-sentence so title casing doesn't read like a headline.
const MINOR_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "of", "at", "by", "for",
  "in", "on", "to", "with", "from", "as", "per", "via", "vs",
]);

/**
 * Tender descriptions arrive from the feed in wildly inconsistent casing —
 * roughly half are shouted in full caps. Left as-is they look broken at
 * display sizes.
 *
 * Title case (rather than sentence case) is the right target: these strings
 * are dense with proper nouns — department names, airports, town names —
 * that sentence casing would flatten into "airports company south africa
 * king phalo". Naturally-cased text passes through untouched.
 */
export function humanize(raw: string): string {
  const clean = raw.replace(/\s+/g, " ").trim();
  const letters = clean.replace(/[^A-Za-z]/g, "");
  const uppers = clean.replace(/[^A-Z]/g, "");
  if (!letters.length || uppers.length / letters.length < 0.7) return clean;

  return clean
    .toLowerCase()
    .split(" ")
    .map((word, i) => {
      if (i > 0 && MINOR_WORDS.has(word.replace(/[^a-z]/g, ""))) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ")
    .replace(ACRONYMS, (m) => m.toUpperCase());
}

export function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/**
 * The headline to show for a tender: humanized description, or the bare
 * reference-code title when no usable description was captured.
 *
 * `description` is frequently not a summary at all but the *entire* raw
 * tender document — terms, evaluation criteria, contact details, all of
 * it, sometimes several KB of it — with only the opening line or two
 * actually shouted in caps. Clip to `max` chars *before* humanizing, so the
 * all-caps detection reads the ~160 characters actually being displayed
 * instead of the whole document, where later mixed-case paragraphs would
 * dilute the ratio and leave a shouted opening line untouched.
 */
export function displayTitle(
  tender: { title: string; description?: string | null },
  max = 160
): string {
  const d = tender.description?.replace(/\s+/g, " ").trim() ?? "";
  const usable = d.length >= 12 && /[a-z]/i.test(d);
  return humanize(clip(usable ? d : tender.title, max));
}

/**
 * `title` is *usually* a genuine reference code, but the feed isn't
 * consistent — some records carry ordinary (sometimes truncated) prose in
 * the title column instead, e.g. "To appoint a panel of suppliers for a
 * period of 24". Showing that back to a bidder labelled "Ref:" would be
 * actively misleading, not helpful — it reads like broken text, not a
 * lookup code. A real reference code essentially never strings together
 * several plain alphabetic words in a row, so that's the signal: 4 or more
 * whitespace-separated tokens that are purely letters means this is prose,
 * not a code, and shouldn't be presented as one.
 */
export function looksLikeReferenceCode(title: string): boolean {
  const alphaTokens = title.split(/\s+/).filter((t) => /^[A-Za-z]+$/.test(t));
  return alphaTokens.length < 4;
}
