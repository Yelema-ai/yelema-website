import { redirect } from "next/navigation";

// Older access links (the back office's Supabase links) end here; setting a password lives on
// /bienvenue now.
export default function ResetPasswordPage() {
  redirect("/bienvenue");
}
