"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAuthClient, getCurrentUser } from "@/lib/supabase-auth";

// Shape returned to the client form (via useActionState) so the UI can show
// a success or error message inline instead of throwing an error overlay.
export interface SaveCompanyState {
  ok: boolean;
  error: string | null;
}

// Every field is a plain text/date input; empty strings become null so we
// don't store blanks. Dates come through as "YYYY-MM-DD" from <input type=date>.
const TEXT_FIELDS = [
  "legal_name",
  "trading_name",
  "registration_number",
  "vat_number",
  "csd_number",
  "tax_compliance_pin",
  "bbbee_level",
  "cidb_grade",
  "physical_address",
  "contact_email",
  "contact_phone",
  "bank_name",
  "bank_account_holder",
  "bank_account_number",
  "bank_branch_code",
  "signatory_name",
  "signatory_capacity",
] as const;

const DATE_FIELDS = ["bbbee_expiry", "cidb_expiry"] as const;

function textOrNull(formData: FormData, name: string): string | null {
  const value = formData.get(name)?.toString().trim();
  return value ? value : null;
}

export async function saveCompanyProfile(
  _prevState: SaveCompanyState,
  formData: FormData
): Promise<SaveCompanyState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const record: Record<string, string | null> = { user_id: user.id };
  for (const field of TEXT_FIELDS) {
    record[field] = textOrNull(formData, field);
  }
  for (const field of DATE_FIELDS) {
    // <input type=date> gives "" when empty and a valid "YYYY-MM-DD" otherwise.
    record[field] = textOrNull(formData, field);
  }
  record.updated_at = new Date().toISOString();

  const supabase = await getSupabaseAuthClient();
  // One row per user (user_id is unique) — upsert so first save inserts and
  // later saves update, without the form needing to know which it is.
  const { error } = await supabase
    .from("company_profiles")
    .upsert(record, { onConflict: "user_id" });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/company");
  return { ok: true, error: null };
}
