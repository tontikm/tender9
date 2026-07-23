"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseAuthClient, getCurrentUser } from "@/lib/supabase-auth";

const VALID_STATUSES = ["new", "saved", "dismissed", "applied"];

export async function updateMatchStatus(matchId: string, status: string) {
  if (!VALID_STATUSES.includes(status)) {
    throw new Error(`Invalid match status: ${status}`);
  }

  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in");

  const supabase = await getSupabaseAuthClient();

  // RLS enforces ownership too, but checking first gives a clear "Match not
  // found" instead of a silent RLS no-op.
  const { data: owned } = await supabase
    .from("tender_matches")
    .select("id")
    .eq("id", matchId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!owned) throw new Error("Match not found");

  const { error } = await supabase
    .from("tender_matches")
    .update({ status })
    .eq("id", matchId);

  if (error) throw error;

  revalidatePath("/dashboard");
}

// Used by the tender detail page's Dismiss button so that, once dismissed,
// the user is returned to wherever they came from (the tender is no longer
// in their view) instead of always landing on the dashboard.
export async function dismissMatchAndReturn(matchId: string, returnTo?: string) {
  await updateMatchStatus(matchId, "dismissed");
  redirect(returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/dashboard");
}

// Saves a tender straight from Browse, with no matching profile behind it —
// creates a manual tender_matches row (profile_id null) the first time, or
// just flips an existing match (profile-scored or manual) to "saved".
export async function saveTenderFromBrowse(tenderId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in");

  const supabase = await getSupabaseAuthClient();

  const { data: existing } = await supabase
    .from("tender_matches")
    .select("id")
    .eq("tender_id", tenderId)
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("tender_matches").update({ status: "saved" }).eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("tender_matches")
      .insert({ tender_id: tenderId, user_id: user.id, profile_id: null, status: "saved" });
    if (error) throw error;
  }

  revalidatePath("/browse");
  revalidatePath("/dashboard");
  revalidatePath("/workspace");
}
