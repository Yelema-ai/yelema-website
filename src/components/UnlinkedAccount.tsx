"use client";

import { branding } from "@/config/branding";
import { useSupabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

// Shown to a signed-in account that belongs to no workspace: in a one-client deployment only the
// back-office or an admin's invitation can attach it.
export function UnlinkedAccount({ email }: { email: string }) {
  const supabase = useSupabase();

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 text-center">
      <div className="max-w-sm space-y-4">
        <h1 className="text-xl font-semibold tracking-tight">{branding.appName}</h1>
        <div className="rounded-lg border bg-card p-6">
          <p className="font-medium">Account not linked</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {email ? <span className="font-medium text-foreground">{email}</span> : "This account"} isn&apos;t
            attached to this organization yet. Contact your administrator for an invitation.
          </p>
        </div>
        <Button variant="outline" onClick={signOut}>
          Log out
        </Button>
      </div>
    </main>
  );
}
