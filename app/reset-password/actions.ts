"use server";

import { redirect } from "next/navigation";
import { getSupabaseAuthClient } from "@/lib/supabase-auth";

export async function updatePassword(formData: FormData) {
  const password = formData.get("password")?.toString() ?? "";
  const confirmPassword = formData.get("confirmPassword")?.toString() ?? "";

  if (password.length < 6) {
    redirect(`/reset-password?error=${encodeURIComponent("Password must be at least 6 characters")}`);
  }
  if (password !== confirmPassword) {
    redirect(`/reset-password?error=${encodeURIComponent("Those passwords don't match")}`);
  }

  const supabase = await getSupabaseAuthClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect(`/reset-password?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/login?message=${encodeURIComponent("Password updated — sign in with your new password.")}`);
}
