"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut } from "lucide-react";
import { EXPERTS } from "@/config/experts";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { ExpertAvatar } from "./ExpertAvatar";

// Shown while the workspace's instance and expert profiles are being set up. Re-checks every 5 s.
export function InstallingScreen() {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [router]);

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-6 py-24 text-center">
      <div className="flex -space-x-3">
        {EXPERTS.slice(0, 6).map((e) => (
          <ExpertAvatar key={e.key} expertKey={e.key} size={52} className="ring-4 ring-bg" />
        ))}
      </div>
      <h1 className="mt-8 font-display text-[30px] font-bold tracking-tight text-ink">Votre équipe s’installe</h1>
      <p className="mt-3 text-[15px] text-ink-2">
        Nous préparons l’ordinateur de vos experts et installons leurs compétences. Cela prend quelques minutes ; cette
        page s’ouvrira toute seule dès que tout est prêt.
      </p>
      <p className="mt-6 flex items-center gap-2 text-sm font-semibold text-brand">
        <Loader2 className="h-4 w-4 animate-spin" /> Installation en cours…
      </p>
    </div>
  );
}

export function NoWorkspaceScreen({ email }: { email: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="max-w-md rounded-[22px] border border-line bg-surface p-8 text-center">
        <h1 className="font-display text-2xl font-bold text-ink">Aucun espace pour ce compte</h1>
        <p className="mt-3 text-[15px] text-ink-2">
          {email} n’est rattaché à aucun espace Yelema. Demandez un lien d’accès à un admin de votre entreprise.
        </p>
        <Button
          variant="outline"
          className="mt-6"
          onClick={async () => {
            await createClient().auth.signOut();
            window.location.href = "/login";
          }}
        >
          <LogOut /> Se déconnecter
        </Button>
      </div>
    </div>
  );
}
