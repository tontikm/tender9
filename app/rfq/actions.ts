"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAuthClient, getCurrentUser } from "@/lib/supabase-auth";
import type { RfqItem } from "./types";

export interface SaveRfqInput {
  id: string;
  tenderId: string | null;
  title: string;
  recipientName: string;
  recipientEmail: string;
  dueDate: string;
  notes: string;
  items: RfqItem[];
}

export interface SaveRfqResult {
  ok: boolean;
  error: string | null;
}

export async function saveRfq(input: SaveRfqInput): Promise<SaveRfqResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const supabase = await getSupabaseAuthClient();
  const { error } = await supabase.from("rfqs").upsert(
    {
      id: input.id,
      user_id: user.id,
      tender_id: input.tenderId,
      title: input.title.trim() || "Request for Quotation",
      recipient_name: input.recipientName.trim() || null,
      recipient_email: input.recipientEmail.trim() || null,
      due_date: input.dueDate || null,
      notes: input.notes.trim() || null,
      items: input.items,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  if (error) return { ok: false, error: error.message };

  revalidatePath("/rfq");
  if (input.tenderId) revalidatePath(`/tenders/${input.tenderId}/workspace`);
  return { ok: true, error: null };
}

export async function deleteRfq(id: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const supabase = await getSupabaseAuthClient();
  await supabase.from("rfqs").delete().eq("id", id).eq("user_id", user.id);
}
