import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AuthFrame } from "@/components/auth/AuthFrame";
import { WelcomeForm } from "./WelcomeForm";

export default async function WelcomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const email = user.email ?? "";
  const name = (user.user_metadata?.name as string | undefined) ?? "";

  return (
    <AuthFrame>
      <WelcomeForm initialEmail={email} initialName={name} />
    </AuthFrame>
  );
}
