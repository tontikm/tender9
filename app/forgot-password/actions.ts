"use server";

import { redirect } from "next/navigation";
import { getSupabaseAuthClient } from "@/lib/supabase-auth";
import { getSiteOrigin } from "@/lib/site-url";

export async function requestPasswordReset(formData: FormData) {
  const email = formData.get("email")?.toString().trim() ?? "";
  if (!email) {
    redirect(`/forgot-password?error=${encodeURIComponent("Enter your email address")}`);
  }

  const supabase = await getSupabaseAuthClient();
  const origin = await getSiteOrigin();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/reset`,
  });

  // Always show the same confirmation, whether or not that email has an
  // account — so this can't be used to check which addresses are registered.
  redirect("/forgot-password?sent=1");
}
