"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase";
import { rematchAllTenders } from "@/lib/match";

function parseList(value: FormDataEntryValue | null): string[] {
  return (value?.toString() ?? "")
    .split(",")
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
  const id = formData.get("id")?.toString() || null;
  const name = formData.get("name")?.toString().trim();
  if (!name) throw new Error("Profile name is required");

  const record = {
    name,
    keywords: parseList(formData.get("keywords")),
    categories: parseList(formData.get("categories")),
    provinces: parseList(formData.get("provinces")),
    min_value: parseNumber(formData.get("min_value")),
    max_value: parseNumber(formData.get("max_value")),
    cidb_grade: formData.get("cidb_grade")?.toString().trim() || null,
    active: formData.get("active") === "on",
  };

  const supabase = getSupabaseServerClient();
  const { error } = id
    ? await supabase.from("matching_profiles").update(record).eq("id", id)
    : await supabase.from("matching_profiles").insert(record);

  if (error) throw error;

  await rematchAllTenders();

  revalidatePath("/profiles");
  revalidatePath("/");
}

export async function deleteProfile(id: string) {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("matching_profiles").delete().eq("id", id);
  if (error) throw error;

  revalidatePath("/profiles");
  revalidatePath("/");
}
