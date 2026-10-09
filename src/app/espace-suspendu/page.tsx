import { AuthShell, AuthHeading } from "@/components/auth/AuthShell";

// Shown by the proxy when the back office says this client is suspended.
export default function EspaceSuspenduPage() {
  return (
    <AuthShell>
      <AuthHeading title="Espace suspendu">
        L’accès à cet espace est suspendu. Si une facture est en attente, réglez-la par le lien reçu par e-mail :
        l’espace rouvre dès le paiement. Sinon, contactez l’administrateur de votre entreprise ou l’équipe Yelema.
      </AuthHeading>
    </AuthShell>
  );
}
