import Link from "next/link";
import { PageBody } from "@/components/app/PageBody";
import { Button } from "@/components/ui/button";

// An address that leads nowhere once signed in: an expert that is not (or no longer) in the
// member's team, an unknown tab. Shown inside the frame, so the menu stays at hand.
export default function NotFound() {
  return (
    <PageBody>
      <div className="max-w-xl">
        <h1 className="font-display text-[28px] font-bold tracking-tight text-ink">Page introuvable</h1>
        <p className="mt-2 text-[15px] text-ink-2">
          Cette page n’existe pas, ou cet expert ne fait pas partie de votre équipe. Vos experts restent accessibles
          depuis le menu.
        </p>
        <Button asChild className="mt-5">
          <Link href="/">Revenir à l’accueil</Link>
        </Button>
      </div>
    </PageBody>
  );
}
