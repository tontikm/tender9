// Turns an OCDS tender's raw_payload into a bid-readiness checklist.
//
// Two kinds of information are combined:
//   1. Tender-specific rules that actually live in the feed — the buyer's
//      `specialConditions` text and whether the briefing is compulsory.
//      These are real, per-tender, and failing them makes a bid
//      non-responsive.
//   2. Standard South African public-procurement requirements that apply to
//      essentially every tender (CSD registration, tax compliance, B-BBEE,
//      the SBD forms). This is domain knowledge, not extracted from the PDF,
//      so the UI flags it as general guidance.

export interface TenderRequirements {
  /** Buyer-authored eligibility text straight from the feed, if any. */
  specialConditions: string | null;
  /** Present when the feed carries briefing details worth surfacing. */
  briefing: {
    compulsory: boolean;
    venue: string | null;
  } | null;
  /** goods | services | works — drives which standard docs apply. */
  mainCategory: string | null;
  /** Documents the bidder must typically prepare. */
  standardDocuments: string[];
  /** Standard SBD forms for a bid/RFQ of this kind. */
  sbdForms: { code: string; title: string }[];
  /** Common reasons a bid gets rejected as non-responsive. */
  disqualifiers: string[];
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// The feed uses several placeholders for "nothing here" — treat them as empty
// so we don't render "n/a" as if it were a real special condition.
const PLACEHOLDERS = new Set(["n/a", "na", "none", "-", "tbc", "tbd"]);

function meaningfulText(value: unknown): string | null {
  const text = cleanText(value);
  if (!text) return null;
  return PLACEHOLDERS.has(text.toLowerCase().replace(/[.\s]/g, "")) ? null : text;
}

const BASE_DOCUMENTS = [
  "Central Supplier Database (CSD) registration — your supplier (MAAA) number",
  "Valid Tax Compliance Status (TCS) PIN from SARS",
  "B-BBEE certificate or sworn affidavit (used to claim preference points)",
  "Certified copies of directors' IDs and your CIPC company registration",
  "Proof of banking details (bank confirmation letter or cancelled cheque)",
];

const BASE_SBD_FORMS = [
  { code: "SBD 1", title: "Invitation to bid / bidder's particulars" },
  { code: "SBD 4", title: "Declaration of interest" },
  { code: "SBD 6.1", title: "Preference points claim (B-BBEE status)" },
  { code: "SBD 8", title: "Declaration of bidder's past SCM practices" },
  { code: "SBD 9", title: "Certificate of independent bid determination" },
];

const BASE_DISQUALIFIERS = [
  "Submitting your bid after the closing date and time",
  "Not being registered (and active) on the Central Supplier Database",
  "An expired or invalid SARS tax compliance status",
  "Leaving mandatory SBD forms unsigned or incomplete",
  "Incomplete pricing or missing required documents",
];

interface RawTenderPayload {
  tender?: {
    specialConditions?: unknown;
    mainProcurementCategory?: unknown;
    briefingSession?: {
      date?: string | null;
      venue?: unknown;
      isSession?: boolean;
      compulsory?: boolean;
    } | null;
  } | null;
}

export function extractRequirements(rawPayload: unknown): TenderRequirements {
  const tender = (rawPayload as RawTenderPayload)?.tender ?? null;

  const specialConditions = meaningfulText(tender?.specialConditions);
  const mainCategory = cleanText(tender?.mainProcurementCategory);

  const session = tender?.briefingSession ?? null;
  const hasBriefing =
    !!session && (session.isSession === true || session.compulsory === true);
  const briefing = hasBriefing
    ? {
        compulsory: session!.compulsory === true,
        venue: meaningfulText(session?.venue),
      }
    : null;

  const standardDocuments = [...BASE_DOCUMENTS];
  if (mainCategory?.toLowerCase() === "works") {
    standardDocuments.push(
      "Valid CIDB grading certificate at (or above) the required grade"
    );
  }

  const disqualifiers = [...BASE_DISQUALIFIERS];
  if (specialConditions) {
    disqualifiers.unshift("Failing to meet the special conditions set by the buyer (see above)");
  }
  if (briefing?.compulsory) {
    disqualifiers.unshift("Not attending the compulsory briefing session");
  }

  return {
    specialConditions,
    briefing,
    mainCategory,
    standardDocuments,
    sbdForms: BASE_SBD_FORMS,
    disqualifiers,
  };
}
