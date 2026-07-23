"use server";

import { getSupabaseAuthClient, getCurrentUser } from "@/lib/supabase-auth";
import { checkBase64Size, MAX_FILL_PDF_BYTES } from "@/lib/limits";

export interface SaveFillResult {
  ok: boolean;
  error: string | null;
}

export interface LoadedFill {
  placements: unknown;
  pdfBase64: string | null;
  docName: string;
  tenderId: string | null;
}

// Saves (or updates) an in-progress fill for the current user. tender_id and
// pdf_base64 are derived by the caller: tender documents re-fetch their bytes,
// so only uploads pass pdfBase64.
export async function saveFill(input: {
  docKey: string;
  docName: string;
  tenderId: string | null;
  placements: unknown;
  pdfBase64: string | null;
}): Promise<SaveFillResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  if (input.pdfBase64) {
    const sizeError = checkBase64Size(input.pdfBase64, MAX_FILL_PDF_BYTES, "This document");
    if (sizeError) return { ok: false, error: sizeError };
  }

  const supabase = await getSupabaseAuthClient();
  const { error } = await supabase.from("document_fills").upsert(
    {
      user_id: user.id,
      tender_id: input.tenderId,
      doc_key: input.docKey,
      doc_name: input.docName,
      placements: input.placements ?? [],
      pdf_base64: input.pdfBase64,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,doc_key" }
  );

  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}

// Full saved fill for one document (placements + bytes for uploads).
export async function loadFill(docKey: string): Promise<LoadedFill | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await getSupabaseAuthClient();
  const { data } = await supabase
    .from("document_fills")
    .select("placements, pdf_base64, doc_name, tender_id")
    .eq("user_id", user.id)
    .eq("doc_key", docKey)
    .maybeSingle<{ placements: unknown; pdf_base64: string | null; doc_name: string; tender_id: string | null }>();

  if (!data) return null;
  return {
    placements: data.placements,
    pdfBase64: data.pdf_base64,
    docName: data.doc_name,
    tenderId: data.tender_id,
  };
}

export async function deleteFill(docKey: string): Promise<SaveFillResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const supabase = await getSupabaseAuthClient();
  const { error } = await supabase.from("document_fills").delete().eq("user_id", user.id).eq("doc_key", docKey);
  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}
