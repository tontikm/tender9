"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAuthClient, getCurrentUser } from "@/lib/supabase-auth";
import { rematchAllTenders } from "@/lib/match";

// Keywords are the user's own search terms, so accept whatever separator they
// reach for — newlines AND commas (people naturally type "ict, computers,
// hardware"). Categories, which can legitimately contain commas, are a
// separate checkbox field, so splitting on commas here is safe.
function parseKeywords(value: FormDataEntryValue | null): string[] {
  return (value?.toString() ?? "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Categories/provinces are now checkbox groups (not free text), so every
// checked box comes through as its own "categories"/"provinces" form field.
function parseCheckboxList(formData: FormData, name: string): string[] {
  return formData.getAll(name).map((v) => v.toString());
}

function parseNumber(value: FormDataEntryValue | null): number | null {
  const str = value?.toString().trim();
  if (!str) return null;
  const n = Number(str);
  return Number.isFinite(n) ? n : null;
}

// Shape returned to the client form (via useActionState) so the UI can
// collapse the editor on success or surface a message on failure, rather
// than throwing an unstyled error overlay.
export interface SaveProfileState {
  ok: boolean;
  error: string | null;
}

export async function saveProfile(
  _prevState: SaveProfileState,
  formData: FormData
): Promise<SaveProfileState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const id = formData.get("id")?.toString() || null;
  const name = formData.get("name")?.toString().trim();
  if (!name) return { ok: false, error: "Profile name is required" };

  const record = {
    user_id: user.id,
    name,
    keywords: parseKeywords(formData.get("keywords")),
    categories: parseCheckboxList(formData, "categories"),
    provinces: parseCheckboxList(formData, "provinces"),
    min_value: parseNumber(formData.get("min_value")),
    max_value: parseNumber(formData.get("max_value")),
    cidb_grade: formData.get("cidb_grade")?.toString().trim() || null,
    active: formData.get("active") === "on",
  };

  const supabase = await getSupabaseAuthClient();
  const { error } = id
    ? await supabase.from("matching_profiles").update(record).eq("id", id).eq("user_id", user.id)
    : await supabase.from("matching_profiles").insert(record);

  if (error) return { ok: false, error: error.message };

  await rematchAllTenders();

  revalidatePath("/profiles");
  revalidatePath("/dashboard");
  return { ok: true, error: null };
}

export async function deleteProfile(id: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in");

  const supabase = await getSupabaseAuthClient();
  const { error } = await supabase.from("matching_profiles").delete().eq("id", id).eq("user_id", user.id);
  if (error) throw error;

  revalidatePath("/profiles");
  revalidatePath("/dashboard");
}
