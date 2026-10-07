import { AuthShell, AuthHeading } from "@/components/auth/AuthShell";

// Shown by the proxy for a host that is no client's (one deployment serves every client).
export default function EspaceIntrouvablePage() {
  return (
    <AuthShell>
      <AuthHeading title="Espace introuvable">
        Cette adresse ne correspond à aucun espace Yelema. Vérifiez le lien reçu de votre administrateur.
      </AuthHeading>
    </AuthShell>
  );
}
