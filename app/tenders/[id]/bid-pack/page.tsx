import { notFound } from "next/navigation";
import { getSupabaseAuthClient, getCurrentUser } from "@/lib/supabase-auth";
import { buildBidPack, type SbdCompany, type SbdTender, type SbdForm } from "@/lib/sbd";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";

function FormBlock({ form }: { form: SbdForm }) {
  return (
    <section className="sbd-form">
      <header className="sbd-form-header">
        <span className="sbd-form-code">{form.code}</span>
        <h2 className="sbd-form-title">{form.title}</h2>
      </header>

      {form.intro && <p className="sbd-form-intro">{form.intro}</p>}

      {form.sections.map((section) => (
        <div className="sbd-section" key={section.heading}>
          <h3 className="sbd-section-heading">{section.heading}</h3>
          <dl className="sbd-fields">
            {section.fields.map((field) => (
              <div className="sbd-field" key={field.label}>
                <dt>{field.label}</dt>
                <dd className={field.value ? "" : "sbd-blank"}>{field.value || "—"}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}

      {form.questions && form.questions.length > 0 && (
        <div className="sbd-section">
          <h3 className="sbd-section-heading">Declarations — tick one per statement</h3>
          <ol className="sbd-questions">
            {form.questions.map((q) => (
              <li key={q}>
                <span className="sbd-question-text">{q}</span>
                <span className="sbd-question-boxes">
                  <span className="sbd-box">&#9633; Yes</span>
                  <span className="sbd-box">&#9633; No</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {form.manualNotes && form.manualNotes.length > 0 && (
        <div className="sbd-manual">
          <h4>To complete by hand</h4>
          <ul>
            {form.manualNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      {form.declaration && (
        <div className="sbd-declaration">
          <p>{form.declaration}</p>
          <div className="sbd-signature">
            <div className="sbd-sign-line">
              <span className="sbd-sign-rule" />
              <span className="sbd-sign-label">Signature</span>
            </div>
            <div className="sbd-sign-line">
              <span className="sbd-sign-rule" />
              <span className="sbd-sign-label">Date</span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default async function BidPackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const supabase = await getSupabaseAuthClient();

  const [{ data: tender }, { data: company }] = await Promise.all([
    supabase
      .from("tenders")
      .select("title, description, buyer_name, category, province, closing_date")
      .eq("id", id)
      .maybeSingle<SbdTender>(),
    supabase
      .from("company_profiles")
      .select("*")
      .eq("user_id", user?.id ?? "")
      .maybeSingle<SbdCompany>(),
  ]);

  if (!tender) notFound();

  const emptyCompany: SbdCompany = {
    legal_name: null,
    trading_name: null,
    registration_number: null,
    vat_number: null,
    csd_number: null,
    tax_compliance_pin: null,
    bbbee_level: null,
    bbbee_expiry: null,
    cidb_grade: null,
    cidb_expiry: null,
    physical_address: null,
    contact_email: null,
    contact_phone: null,
    bank_name: null,
    bank_account_holder: null,
    bank_account_number: null,
    bank_branch_code: null,
    signatory_name: null,
    signatory_capacity: null,
  };

  const pack = buildBidPack(company ?? emptyCompany, tender);

  return (
    <main className="bid-pack">
      <div className="bid-pack-toolbar">
        <a href={`/tenders/${id}`}>&larr; Back to tender</a>
        <PrintButton />
      </div>

      {(!company || pack.missingFields.length > 0) && (
        <div className="bid-pack-notice">
          <strong>Some details are missing.</strong> The forms below are filled from your{" "}
          <a href="/company">company profile</a>. Complete these to finish auto-filling:{" "}
          {pack.missingFields.join(", ") || "your company profile"}.
        </div>
      )}

      <div className="bid-pack-cover">
        <p className="bid-pack-kicker">SBD bid pack</p>
        <h1>{pack.company.legal_name || "Your company"}</h1>
        <dl className="sbd-fields">
          <div className="sbd-field">
            <dt>Tender</dt>
            <dd>{pack.tender.title}</dd>
          </div>
          <div className="sbd-field">
            <dt>Description</dt>
            <dd className={pack.tender.description ? "" : "sbd-blank"}>
              {pack.tender.description || "—"}
            </dd>
          </div>
          <div className="sbd-field">
            <dt>Organ of state</dt>
            <dd className={pack.tender.buyer_name ? "" : "sbd-blank"}>{pack.tender.buyer_name || "—"}</dd>
          </div>
          <div className="sbd-field">
            <dt>Generated</dt>
            <dd>{pack.generatedOn}</dd>
          </div>
          <div className="sbd-field">
            <dt>Forms included</dt>
            <dd>{pack.forms.map((f) => f.code).join(", ")}</dd>
          </div>
        </dl>
        <p className="bid-pack-disclaimer">
          Pre-filled from your saved company profile as a working document. Check every field
          against the official tender document, complete any items marked &ldquo;to complete by
          hand&rdquo;, then print or save as PDF, sign, and submit. This is an aid, not a
          substitute for the organ of state&rsquo;s official forms where those are required.
        </p>
      </div>

      {pack.forms.map((form) => (
        <FormBlock key={form.code} form={form} />
      ))}
    </main>
  );
}
