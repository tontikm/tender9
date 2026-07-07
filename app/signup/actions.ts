"use server";

import { redirect } from "next/navigation";
import { getSupabaseAuthClient } from "@/lib/supabase-auth";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function signUp(formData: FormData) {
  const email = formData.get("email")?.toString().trim() ?? "";
  const password = formData.get("password")?.toString() ?? "";
  const companyName = formData.get("company_name")?.toString().trim() ?? "";

  if (!companyName) {
    redirect(`/signup?error=${encodeURIComponent("Company name is required")}`);
  }

  const supabase = await getSupabaseAuthClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  }

  // Give every new account a starter matching profile so /profiles isn't empty.
  if (data.user) {
    const admin = getSupabaseServerClient();
    await admin.from("matching_profiles").insert({
      user_id: data.user.id,
      name: companyName,
      keywords: [],
      categories: [],
      provinces: [],
      active: true,
    });
  }

  if (!data.session) {
    redirect("/login?message=Check your email to confirm your account, then sign in.");
  }

  redirect("/");
}
