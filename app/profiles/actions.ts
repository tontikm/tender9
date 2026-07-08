"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAuthClient, getCurrentUser } from "@/lib/supabase-auth";
import { rematchAllTenders } from "@/lib/match";

// One entry per line — comma-splitting breaks on values that contain commas
// themselves, which real OCDS category names do (e.g. "Computer programming,
// consultancy and related activities" is a single category, not two).
function parseList(value: FormDataEntryValue | null): string[] {
  return (value?.toString() ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseNumber(value: FormDataEntryValue | null): number | null {
  const str = value?.toString().trim();
  if (!str) return null;
  const n = Number(str);
  return Number.isFinite(n) ? n : null;
}

export async function saveProfile(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in");

  const id = formData.get("id")?.toString() || null;
  const name = formData.get("name")?.toString().trim();
  if (!name) throw new Error("Profile name is required");

  const record = {
    user_id: user.id,
    name,
    keywords: parseList(formData.get("keywords")),
    categories: parseList(formData.get("categories")),
    provinces: parseList(formData.get("provinces")),
    min_value: parseNumber(formData.get("min_value")),
    max_value: parseNumber(formData.get("max_value")),
    cidb_grade: formData.get("cidb_grade")?.toString().trim() || null,
    active: formData.get("active") === "on",
  };

  const supabase = await getSupabaseAuthClient();
  const { error } = id
    ? await supabase.from("matching_profiles").update(record).eq("id", id).eq("user_id", user.id)
    : await supabase.from("matching_profiles").insert(record);

  if (error) throw error;

  await rematchAllTenders();

  revalidatePath("/profiles");
  revalidatePath("/dashboard");
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
