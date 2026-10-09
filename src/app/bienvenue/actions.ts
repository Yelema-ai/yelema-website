"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MIN_PASSWORD } from "@/config/auth";

export async function updatePasswordAction(
  _prevState: { error?: string } | null,
  formData: FormData
) {
  const name = ((formData.get("name") as string) || "").trim();
  const password = formData.get("password") as string;
  const confirm = formData.get("confirm") as string;

  if (!password || password.length < MIN_PASSWORD) {
    return {
      error: `Le mot de passe doit faire au moins ${MIN_PASSWORD} caractères.`,
    };
  }

  if (password !== confirm) {
    return {
      error: "Les deux mots de passe ne correspondent pas.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password,
    data: { name },
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/accueil");
}
