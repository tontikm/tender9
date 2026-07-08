// Builds pre-filled SBD (Standard Bidding Document) form content from a
// company profile + a tender. Pure data — no React — so it can back a print
// view now and a generated-PDF download later.
//
// Coverage today: SBD 1 (bidder's particulars) and SBD 6.1 (preference
// points claim). The structure below (forms → sections → fields) is generic
// so SBD 4/8/9 can be added as more entries without touching the renderer.

import { formatDate } from "./format";

export interface SbdCompany {
  legal_name: string | null;
  trading_name: string | null;
  registration_number: string | null;
  vat_number: string | null;
  csd_number: string | null;
  tax_compliance_pin: string | null;
  bbbee_level: string | null;
  bbbee_expiry: string | null;
  cidb_grade: string | null;
  cidb_expiry: string | null;
  physical_address: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  bank_name: string | null;
  bank_account_holder: string | null;
  bank_account_number: string | null;
  bank_branch_code: string | null;
  signatory_name: string | null;
  signatory_capacity: string | null;
}

export interface SbdTender {
  // For eTenders OCDS records, `title` is the government's tender/RFQ
  // reference (e.g. "RFQ/CMS/CORP/06/07/2026") and `description` is the
  // prose. The OCID is deliberately not used here — it means nothing to a
  // bidder filling in a "bid number".
  title: string;
  description: string | null;
  buyer_name: string | null;
  category: string | null;
  province: string | null;
  closing_date: string | null;
}

export interface SbdField {
  label: string;
  value: string | null;
}

export interface SbdSection {
  heading: string;
  fields: SbdField[];
}

export interface SbdForm {
  code: string;
  title: string;
  intro?: string;
  sections: SbdSection[];
  // Yes/No declaration statements the bidder must answer by hand (SBD 4/8) —
  // rendered with tick boxes, since we can't answer them on the bidder's behalf.
  questions?: string[];
  // Parts the bidder must still complete/answer by hand (we can't auto-fill).
  manualNotes?: string[];
  // Declaration signed at the foot of the form.
  declaration?: string;
}

export interface BidPack {
  company: SbdCompany;
  tender: SbdTender;
  generatedOn: string;
  forms: SbdForm[];
  // Key company fields left blank — the UI nudges the user to complete these.
  missingFields: string[];
}

// PPPFA preference points by B-BBEE status level, for both the 80/20 system
// (tenders up to R50m) and the 90/10 system (above R50m).
const PREFERENCE_POINTS: Record<string, { pts8020: number; pts9010: number }> = {
  "Level 1": { pts8020: 20, pts9010: 10 },
  "Level 2": { pts8020: 18, pts9010: 9 },
  "Level 3": { pts8020: 14, pts9010: 6 },
  "Level 4": { pts8020: 12, pts9010: 5 },
  "Level 5": { pts8020: 8, pts9010: 4 },
  "Level 6": { pts8020: 6, pts9010: 3 },
  "Level 7": { pts8020: 4, pts9010: 2 },
  "Level 8": { pts8020: 2, pts9010: 1 },
  "Non-compliant": { pts8020: 0, pts9010: 0 },
};

function tenderReference(tender: SbdTender): string {
  return tender.title;
}

function buildSbd1(company: SbdCompany, tender: SbdTender): SbdForm {
  return {
    code: "SBD 1",
    title: "Invitation to Bid — Bidder's Particulars",
    sections: [
      {
        heading: "Bid details",
        fields: [
          { label: "Bid / tender number", value: tenderReference(tender) },
          { label: "Description", value: tender.description },
          { label: "Issued by (organ of state)", value: tender.buyer_name },
          {
            label: "Closing date & time",
            value: tender.closing_date ? formatDate(tender.closing_date) : null,
          },
        ],
      },
      {
        heading: "Name and address of bidder",
        fields: [
          { label: "Name of bidder (registered)", value: company.legal_name },
          { label: "Trading name", value: company.trading_name },
          { label: "Company registration number", value: company.registration_number },
          { label: "VAT registration number", value: company.vat_number },
          { label: "CSD supplier number", value: company.csd_number },
          { label: "Postal / physical address", value: company.physical_address },
        ],
      },
      {
        heading: "Contact details",
        fields: [
          { label: "Contact person", value: company.signatory_name },
          { label: "Telephone number", value: company.contact_phone },
          { label: "E-mail address", value: company.contact_email },
        ],
      },
      {
        heading: "Tax & compliance",
        fields: [
          { label: "SARS Tax Compliance Status (TCS) PIN", value: company.tax_compliance_pin },
          { label: "B-BBEE status level", value: company.bbbee_level },
          { label: "CIDB grading (if applicable)", value: company.cidb_grade },
        ],
      },
      {
        heading: "Banking details",
        fields: [
          { label: "Bank", value: company.bank_name },
          { label: "Account holder", value: company.bank_account_holder },
          { label: "Account number", value: company.bank_account_number },
          { label: "Branch code", value: company.bank_branch_code },
        ],
      },
    ],
    manualNotes: [
      "Confirm whether you are registered and active on the National Treasury Central Supplier Database (CSD).",
      "Indicate whether you are a South African-based supplier and whether you will subcontract more than 25% of the contract.",
    ],
  };
}

function buildSbd61(company: SbdCompany, tender: SbdTender): SbdForm {
  const level = company.bbbee_level ?? "";
  const points = PREFERENCE_POINTS[level];

  const claimFields: SbdField[] = [
    { label: "B-BBEE status level of contributor", value: company.bbbee_level },
    { label: "Certificate / affidavit expiry", value: company.bbbee_expiry ? formatDate(company.bbbee_expiry) : null },
    {
      label: "Preference points (80/20 system — bids up to R50m)",
      value: points ? String(points.pts8020) : null,
    },
    {
      label: "Preference points (90/10 system — bids above R50m)",
      value: points ? String(points.pts9010) : null,
    },
  ];

  const manualNotes = [
    "Confirm which preference point system applies — it depends on the estimated value of this specific bid (80/20 up to R50m, 90/10 above R50m).",
    "Attach your valid B-BBEE status level verification certificate or sworn affidavit (EMEs/QSEs).",
  ];
  if (level === "Exempt Micro Enterprise") {
    manualNotes.unshift(
      "As an Exempt Micro Enterprise, your B-BBEE level is set by affidavit (typically Level 4, or Level 1/2 if black-owned) — enter the confirmed level and its points manually."
    );
  }

  return {
    code: "SBD 6.1",
    title: "Preference Points Claim Form (PPPFA)",
    intro:
      "This form is completed to claim preference points for B-BBEE status level, in terms of the Preferential Procurement Policy Framework Act (PPPFA) and its regulations.",
    sections: [
      {
        heading: "Bidder",
        fields: [
          { label: "Name of bidder", value: company.legal_name },
          { label: "Bid / tender number", value: tenderReference(tender) },
        ],
      },
      {
        heading: "Points claimed",
        fields: claimFields,
      },
    ],
    manualNotes,
    declaration:
      "I/we, the undersigned, confirm that the B-BBEE status level claimed above is correct and that I/we are aware that the points claimed are subject to verification. I/we accept that misrepresentation may lead to disqualification and other remedies available to the organ of state.",
  };
}

function buildSbd4(company: SbdCompany, tender: SbdTender): SbdForm {
  return {
    code: "SBD 4",
    title: "Declaration of Interest",
    intro:
      "Any legal person, including persons employed by the state, or persons connected to a bidder, must declare any conflict of interest that may arise from being awarded this bid. This form must be completed and submitted with the bid.",
    sections: [
      {
        heading: "Bidder & authorised person",
        fields: [
          { label: "Full name of bidder", value: company.legal_name },
          { label: "Company registration number", value: company.registration_number },
          { label: "Tax reference / TCS PIN", value: company.tax_compliance_pin },
          { label: "Name of authorised person", value: company.signatory_name },
          { label: "Position held", value: company.signatory_capacity },
        ],
      },
    ],
    questions: [
      "Are you or any person connected with the bidder presently employed by the state?",
      "Do you or any person connected with the bidder have any relationship (family, friend, other) with a person employed by the organ of state and involved in the evaluation and/or adjudication of this bid?",
      "Are you or any person connected with the bidder aware of any relationship between yourself and any person employed by the organ of state who may be involved in this bid?",
      "Do you or any person connected with the bidder have any interest in any other bidder submitting a bid for this contract?",
    ],
    manualNotes: [
      "For each question above, tick Yes or No. If Yes to any, attach full particulars (names, ID numbers, nature of the relationship/interest) on a separate signed sheet.",
      "List the ID numbers of all directors/members/shareholders — Tender9 does not store these.",
    ],
    declaration:
      "I, the undersigned, certify that the information furnished on this declaration is correct, and I accept that the state may reject the bid or act against me should this declaration prove to be false.",
  };
}

function buildSbd8(company: SbdCompany, tender: SbdTender): SbdForm {
  return {
    code: "SBD 8",
    title: "Declaration of Bidder's Past Supply Chain Management Practices",
    intro:
      "This declaration will be taken into account in the evaluation of the bid. It serves as a declaration of the bidder's past supply chain management practices.",
    sections: [
      {
        heading: "Bidder",
        fields: [
          { label: "Name of bidder", value: company.legal_name },
          { label: "Bid / tender number", value: tenderReference(tender) },
        ],
      },
    ],
    questions: [
      "Is the bidder, or any of its directors, listed on the National Treasury Register for Tender Defaulters or the Database of Restricted Suppliers (prohibited from doing business with the public sector)?",
      "Has the bidder, or any of its directors, been convicted of fraud or corruption by a court of law (including a court outside South Africa) in the past five years?",
      "Was any contract between the bidder and an organ of state terminated during the past five years on account of failure to perform in terms of the contract?",
      "Has the bidder, or any of its directors, abused the supply chain management system or committed a fraudulent or other improper act in relation to such system?",
    ],
    manualNotes: [
      "Tick Yes or No for each statement above. If Yes to any, provide full particulars on a separate signed sheet.",
    ],
    declaration:
      "I, the undersigned, certify that the information furnished above is correct. I accept that, in addition to cancellation of a contract, action may be taken against me should this declaration prove to be false.",
  };
}

function buildSbd9(company: SbdCompany, tender: SbdTender): SbdForm {
  return {
    code: "SBD 9",
    title: "Certificate of Independent Bid Determination",
    intro:
      "Section 4 (1) (b) (iii) of the Competition Act prohibits collusive bidding. This certificate must be submitted with the bid.",
    sections: [
      {
        heading: "Bidder",
        fields: [
          { label: "Name of bidder", value: company.legal_name },
          { label: "Bid / tender number", value: tenderReference(tender) },
          { label: "Authorised signatory", value: company.signatory_name },
          { label: "Capacity / position", value: company.signatory_capacity },
        ],
      },
    ],
    declaration:
      "I, the undersigned, in submitting the accompanying bid, certify that: I am authorised by the bidder to sign this certificate and to submit this bid on its behalf; each price in this bid has been arrived at independently, without consultation, communication, agreement or arrangement with any competitor; the prices have not been and will not be disclosed to any competitor before bid opening; and no attempt has been made to induce any other party to submit or not submit a bid for the purpose of restricting competition.",
  };
}

const REQUIRED_FIELDS: { key: keyof SbdCompany; label: string }[] = [
  { key: "legal_name", label: "Registered company name" },
  { key: "registration_number", label: "CIPC registration number" },
  { key: "csd_number", label: "CSD supplier number" },
  { key: "tax_compliance_pin", label: "SARS tax compliance PIN" },
  { key: "bbbee_level", label: "B-BBEE status level" },
  { key: "signatory_name", label: "Authorised signatory" },
];

export function buildBidPack(company: SbdCompany, tender: SbdTender): BidPack {
  const missingFields = REQUIRED_FIELDS.filter(
    (f) => !company[f.key] || String(company[f.key]).trim() === ""
  ).map((f) => f.label);

  return {
    company,
    tender,
    generatedOn: formatDate(new Date().toISOString()),
    forms: [
      buildSbd1(company, tender),
      buildSbd4(company, tender),
      buildSbd61(company, tender),
      buildSbd8(company, tender),
      buildSbd9(company, tender),
    ],
    missingFields,
  };
}
