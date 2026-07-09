"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAuthClient, getCurrentUser } from "@/lib/supabase-auth";
import { normaliseChecklist, type WorkspaceChecklist } from "@/lib/bid-workspace";

export interface SaveWorkspaceState {
  ok: boolean;
  error: string | null;
}

// Upserts the whole workspace (checklist + notes) for the current user and
// tender. Called on every change from the client with the full state, so the
// server doesn't need to diff — one row per (user, tender) via the unique
// constraint. RLS scopes writes to the user's own rows.
export async function saveWorkspace(
  tenderId: string,
  checklist: WorkspaceChecklist,
  notes: string
): Promise<SaveWorkspaceState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const supabase = await getSupabaseAuthClient();
  const { error } = await supabase.from("bid_workspaces").upsert(
    {
      user_id: user.id,
      tender_id: tenderId,
      checklist: normaliseChecklist(checklist),
      notes: notes.trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,tender_id" }
  );

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/tenders/${tenderId}/workspace`);
  return { ok: true, error: null };
}
