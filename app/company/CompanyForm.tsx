"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { saveCompanyProfile, type SaveCompanyState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="company-save-btn" disabled={pending}>
      {pending ? "Saving…" : "Save company profile"}
    </button>
  );
}

export interface CompanyProfile {
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
  logo_data_url: string | null;
}

const LOGO_MAX_DIMENSION = 400;

// Downscales/re-encodes any uploaded image to a PNG data URL client-side, so
// we never store a multi-megabyte photo straight from someone's phone.
function resizeLogo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not read the image"));
      img.onload = () => {
        const ratio = Math.min(1, LOGO_MAX_DIMENSION / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

const BBBEE_LEVELS = [
  "Level 1",
  "Level 2",
  "Level 3",
  "Level 4",
  "Level 5",
  "Level 6",
  "Level 7",
  "Level 8",
  "Non-compliant",
  "Exempt Micro Enterprise",
];

const INITIAL_STATE: SaveCompanyState = { ok: false, error: null };

export function CompanyForm({ profile }: { profile: CompanyProfile | null }) {
  const [state, formAction, isPending] = useActionState(saveCompanyProfile, INITIAL_STATE);
  const [saved, setSaved] = useState(false);
  const [logo, setLogo] = useState(profile?.logo_data_url ?? "");
  const [logoError, setLogoError] = useState<string | null>(null);
  const wasPending = useRef(false);
  const v = (key: keyof CompanyProfile) => profile?.[key] ?? "";

  const handleLogoFile = async (file: File | undefined) => {
    if (!file) return;
    setLogoError(null);
    try {
      setLogo(await resizeLogo(file));
    } catch {
      setLogoError("Couldn't read that image. Try a PNG or JPG file.");
    }
  };

  // Surface a clear reaction each time a save completes successfully.
  useEffect(() => {
    if (isPending) {
      wasPending.current = true;
      return;
    }
    if (wasPending.current) {
      wasPending.current = false;
      if (state.ok) {
        setSaved(true);
        const t = setTimeout(() => setSaved(false), 3500);
        return () => clearTimeout(t);
      }
    }
  }, [isPending, state]);

  return (
    <form action={formAction} className="profile-card-form">
      {saved && (
        <div className="save-toast" role="status">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          Company profile saved
        </div>
      )}
      <section className="form-section">
        <h3 className="form-section-heading">Company logo</h3>
        <p className="hint">Appears on your request-for-quotation documents.</p>
        <div className="logo-upload">
          {logo ? (
            <img src={logo} alt="Company logo" className="logo-preview" />
          ) : (
            <div className="logo-preview logo-preview-empty">No logo</div>
          )}
          <div className="logo-upload-actions">
            <label className="btn logo-upload-btn">
              {logo ? "Change logo" : "Upload logo"}
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={(e) => handleLogoFile(e.target.files?.[0])}
                hidden
              />
            </label>
            {logo && (
              <button type="button" className="btn" onClick={() => setLogo("")}>
                Remove
              </button>
            )}
          </div>
          {logoError && <p className="auth-error">{logoError}</p>}
        </div>
        <input type="hidden" name="logo_data_url" value={logo} />
      </section>

      <section className="form-section">
        <h3 className="form-section-heading">Company identity</h3>
        <div className="form-grid">
          <div className="form-field">
            <label htmlFor="legal_name">Registered (legal) name</label>
            <input type="text" id="legal_name" name="legal_name" defaultValue={v("legal_name")} />
          </div>
          <div className="form-field">
            <label htmlFor="trading_name">Trading name</label>
            <input type="text" id="trading_name" name="trading_name" defaultValue={v("trading_name")} />
          </div>
          <div className="form-field">
            <label htmlFor="registration_number">CIPC registration number</label>
            <input
              type="text"
              id="registration_number"
              name="registration_number"
              defaultValue={v("registration_number")}
              placeholder="e.g. 2021/123456/07"
            />
          </div>
          <div className="form-field">
            <label htmlFor="vat_number">VAT number</label>
            <input type="text" id="vat_number" name="vat_number" defaultValue={v("vat_number")} />
          </div>
          <div className="form-field">
            <label htmlFor="csd_number">CSD (supplier) number</label>
            <input
              type="text"
              id="csd_number"
              name="csd_number"
              defaultValue={v("csd_number")}
              placeholder="e.g. MAAA0123456"
            />
          </div>
          <div className="form-field">
            <label htmlFor="tax_compliance_pin">SARS tax compliance PIN</label>
            <input
              type="text"
              id="tax_compliance_pin"
              name="tax_compliance_pin"
              defaultValue={v("tax_compliance_pin")}
            />
          </div>
        </div>
      </section>

      <section className="form-section">
        <h3 className="form-section-heading">B-BBEE &amp; grading</h3>
        <div className="form-grid">
          <div className="form-field">
            <label htmlFor="bbbee_level">B-BBEE status</label>
            <select id="bbbee_level" name="bbbee_level" defaultValue={v("bbbee_level")}>
              <option value="">—</option>
              {BBBEE_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="bbbee_expiry">B-BBEE certificate expiry</label>
            <input type="date" id="bbbee_expiry" name="bbbee_expiry" defaultValue={v("bbbee_expiry")} />
          </div>
          <div className="form-field">
            <label htmlFor="cidb_grade">CIDB grade</label>
            <input
              type="text"
              id="cidb_grade"
              name="cidb_grade"
              defaultValue={v("cidb_grade")}
              placeholder="e.g. 5GB (leave blank if N/A)"
            />
          </div>
          <div className="form-field">
            <label htmlFor="cidb_expiry">CIDB registration expiry</label>
            <input type="date" id="cidb_expiry" name="cidb_expiry" defaultValue={v("cidb_expiry")} />
          </div>
        </div>
      </section>

      <section className="form-section">
        <h3 className="form-section-heading">Contact &amp; address</h3>
        <div className="form-grid">
          <div className="form-field full">
            <label htmlFor="physical_address">Physical / postal address</label>
            <textarea
              id="physical_address"
              name="physical_address"
              rows={2}
              defaultValue={v("physical_address")}
            />
          </div>
          <div className="form-field">
            <label htmlFor="contact_email">Contact email</label>
            <input type="email" id="contact_email" name="contact_email" defaultValue={v("contact_email")} />
          </div>
          <div className="form-field">
            <label htmlFor="contact_phone">Contact phone</label>
            <input type="tel" id="contact_phone" name="contact_phone" defaultValue={v("contact_phone")} />
          </div>
        </div>
      </section>

      <section className="form-section">
        <h3 className="form-section-heading">Banking details</h3>
        <div className="form-grid">
          <div className="form-field">
            <label htmlFor="bank_name">Bank name</label>
            <input type="text" id="bank_name" name="bank_name" defaultValue={v("bank_name")} />
          </div>
          <div className="form-field">
            <label htmlFor="bank_account_holder">Account holder</label>
            <input
              type="text"
              id="bank_account_holder"
              name="bank_account_holder"
              defaultValue={v("bank_account_holder")}
            />
          </div>
          <div className="form-field">
            <label htmlFor="bank_account_number">Account number</label>
            <input
              type="text"
              id="bank_account_number"
              name="bank_account_number"
              defaultValue={v("bank_account_number")}
            />
          </div>
          <div className="form-field">
            <label htmlFor="bank_branch_code">Branch code</label>
            <input
              type="text"
              id="bank_branch_code"
              name="bank_branch_code"
              defaultValue={v("bank_branch_code")}
            />
          </div>
        </div>
      </section>

      <section className="form-section">
        <h3 className="form-section-heading">Authorised signatory</h3>
        <div className="form-grid">
          <div className="form-field">
            <label htmlFor="signatory_name">Full name</label>
            <input type="text" id="signatory_name" name="signatory_name" defaultValue={v("signatory_name")} />
          </div>
          <div className="form-field">
            <label htmlFor="signatory_capacity">Capacity / role</label>
            <input
              type="text"
              id="signatory_capacity"
              name="signatory_capacity"
              defaultValue={v("signatory_capacity")}
              placeholder="e.g. Director"
            />
          </div>
        </div>
      </section>

      {state.error && <p className="auth-error">{state.error}</p>}

      <div className="form-footer">
        <span className="hint">Used to fill your bid documents. You can complete it in stages.</span>
        <SubmitButton />
      </div>
    </form>
  );
}
