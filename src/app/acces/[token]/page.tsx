import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { readAccessLink } from "@/lib/access-links";
import { AuthFrame } from "@/components/auth/AuthFrame";
import { Button } from "@/components/ui/button";

// An access link's landing page. Opening it (a GET) changes nothing, so link previews and mail
// scanners can't use it up; the button POSTs, which signs the person in and consumes the link.
export default async function AccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ e?: string }>;
}) {
  const { token } = await params;
  const { e } = await searchParams;
  const db = createAdminClient();
  const link = await readAccessLink(db, token);
  const workspace = link
    ? (await db.from("workspaces").select("name").eq("id", link.workspace_id).maybeSingle()).data
    : null;

  return (
    <AuthFrame>
      {link && workspace && !e ? (
        <form action={`/api/acces/${token}`} method="post" className="space-y-5">
          <h2 className="font-display text-[30px] font-bold tracking-tight text-ink">Bienvenue sur Yelema</h2>
          <p className="text-[15px] text-ink-2">
            Ce lien vous ouvre l’espace <b className="text-ink">{workspace.name}</b> en tant que{" "}
            <b className="text-ink">{link.email}</b>. Vous choisirez ensuite votre mot de passe.
          </p>
          <Button type="submit" size="lg" className="w-full">
            Accéder à l’espace <ArrowRight />
          </Button>
        </form>
      ) : (
        <div className="space-y-5">
          <h2 className="font-display text-[30px] font-bold tracking-tight text-ink">Lien expiré</h2>
          <p className="text-[15px] text-ink-2">
            Ce lien a déjà servi ou n’est plus valable (7 jours). Demandez-en un nouveau à un admin de votre équipe, ou
            connectez-vous si vous avez déjà un mot de passe.
          </p>
          <Button asChild size="lg" variant="outline" className="w-full">
            <Link href="/login">Se connecter</Link>
          </Button>
        </div>
      )}
    </AuthFrame>
  );
}
