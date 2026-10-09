"use client";

import { useEffect } from "react";
import { AuthShell, AuthHeading } from "@/components/auth/AuthShell";

// The frame itself could not be built: most often the back office did not answer when asked who is
// signed in. Nothing here says the user is signed out, so it offers to try again, not to sign in.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <AuthShell>
      <AuthHeading title="Yelema est momentanément indisponible">
        Votre espace n’a pas pu s’ouvrir. Réessayez dans un instant ; si cela continue, contactez Yelema.
      </AuthHeading>
      <button
        type="button"
        onClick={reset}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand px-6 text-[15px] font-semibold text-on-brand hover:opacity-90"
      >
        Réessayer
      </button>
    </AuthShell>
  );
}
