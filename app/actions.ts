"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase";

const VALID_STATUSES = ["new", "saved", "dismissed", "applied"];

export async function updateMatchStatus(matchId: string, status: string) {
  if (!VALID_STATUSES.includes(status)) {
    throw new Error(`Invalid match status: ${status}`);
  }

  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("tender_matches")
    .update({ status })
    .eq("id", matchId);

  if (error) throw error;

  revalidatePath("/");
}
