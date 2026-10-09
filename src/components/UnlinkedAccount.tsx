"use client";

import { branding } from "@/config/branding";
import { signOutEverywhere, useSupabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

// Shown to a signed-in account that belongs to no workspace: in a one-client deployment only the
// back-office or an admin's invitation can attach it.
export function UnlinkedAccount({ email }: { email: string }) {
  const supabase = useSupabase();

  async function signOut() {
    await signOutEverywhere(supabase);
    window.location.href = "/login";
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 text-center">
      <div className="max-w-sm space-y-4">
        <h1 className="text-xl font-semibold tracking-tight">{branding.appName}</h1>
        <div className="rounded-lg border bg-card p-6">
          <p className="font-medium">Compte non rattaché</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {email ? <span className="font-medium text-foreground">{email}</span> : "Ce compte"} n’est rattaché à
            aucun espace Yelema pour le moment. Contactez l’administrateur de votre entreprise.
          </p>
        </div>
        <Button variant="outline" onClick={signOut}>
          Se déconnecter
        </Button>
      </div>
    </main>
  );
}
