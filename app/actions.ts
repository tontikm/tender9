"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAuthClient, getCurrentUser } from "@/lib/supabase-auth";
import { generateDraftForTender } from "@/lib/draft";

const VALID_STATUSES = ["new", "saved", "dismissed", "applied"];

export async function updateMatchStatus(matchId: string, status: string) {
  if (!VALID_STATUSES.includes(status)) {
    throw new Error(`Invalid match status: ${status}`);
  }

  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in");

  const supabase = await getSupabaseAuthClient();

  // tender_matches has no user_id column of its own — ownership is via
  // its matching_profiles row. RLS enforces this too, but checking first
  // gives a clear "Match not found" instead of a silent RLS no-op.
  const { data: owned } = await supabase
    .from("tender_matches")
    .select("id, matching_profiles!inner(user_id)")
    .eq("id", matchId)
    .eq("matching_profiles.user_id", user.id)
    .maybeSingle();

  if (!owned) throw new Error("Match not found");

  const { error } = await supabase
    .from("tender_matches")
    .update({ status })
    .eq("id", matchId);

  if (error) throw error;

  revalidatePath("/dashboard");
}

export async function generateDraft(tenderId: string) {
  await generateDraftForTender(tenderId);
  revalidatePath("/dashboard");
}
