"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSupabaseAuthClient } from "@/lib/supabase-auth";

export async function signInWithGoogle() {
  const hdrs = await headers();
  const origin = hdrs.get("origin") ?? `https://${hdrs.get("host")}`;

  const supabase = await getSupabaseAuthClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback` },
  });

  if (error || !data?.url) {
    redirect(`/login?error=${encodeURIComponent(error?.message ?? "Could not start Google sign-in")}`);
  }

  // Hand off to Google's consent screen (Supabase authorize URL).
  redirect(data.url);
}

export async function signIn(formData: FormData) {
  const email = formData.get("email")?.toString().trim() ?? "";
  const password = formData.get("password")?.toString() ?? "";

  const supabase = await getSupabaseAuthClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await getSupabaseAuthClient();
  await supabase.auth.signOut();
  redirect("/login");
}
