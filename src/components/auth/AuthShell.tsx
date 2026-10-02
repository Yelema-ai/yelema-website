import Image from "next/image";
import Link from "next/link";
import { Lock } from "lucide-react";

const EXPERTS = [
  { prenom: "Fatou", metier: "Experte RH et Paie", left: "3.2%" },
  { prenom: "Ibrahim", metier: "Expert Juridique et Conformité", left: "38.6%" },
  { prenom: "Fatima", metier: "Experte Marketing et Contenu", left: "74.2%" },
];

/**
 * Coquille des écrans d'authentification : carte en deux colonnes, la marque à
 * gauche sur fond dégradé, le formulaire à droite.
 *
 * Portée des maquettes `yelema-front-v2` (`auth_page()`, classes .auth/.aucard/.aul/.aur).
 * À une colonne sous 900 px, la colonne de marque passant alors sous le formulaire.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-8">
      <div className="grid w-full max-w-[1080px] overflow-hidden rounded-[28px] bg-card shadow-[0_30px_70px_-30px_rgba(23,17,43,0.35)] md:grid-cols-2">
        <aside className="relative order-2 flex min-h-[600px] flex-col gap-3.5 overflow-hidden bg-[linear-gradient(160deg,var(--brand)_0%,#1B0E3F_100%)] p-8 text-white md:order-1">
          <Link href="/login" className="flex items-center gap-2.5">
            <Image
              src="/yelema-long.png"
              alt="Yelema"
              width={160}
              height={46}
              priority
              className="h-[46px] w-auto rounded-xl bg-white px-3 py-[7px]"
            />
          </Link>

          <div className="mt-7">
            <h1 className="text-balance text-[32px] leading-[1.15] font-semibold tracking-[-0.02em]">
              Décuplez les forces
              <br />
              <span className="font-semibold">de votre entreprise</span>.
            </h1>
            <p className="mt-3 text-[15px] text-white/85">
              Une IA pensée pour l’Afrique, prête à l’emploi, au service de vos équipes.
            </p>
          </div>

          <div className="relative mx-auto mt-auto mb-0 w-full max-w-[380px] [container-type:inline-size]">
            <Image
              src="/hero-experts.webp"
              alt="Trois Experts IA Yelema : Fatou, Ibrahim et Fatima"
              width={760}
              height={620}
              priority
              className="h-auto w-full drop-shadow-[0_25px_50px_rgba(10,6,30,0.45)]"
            />
            {EXPERTS.map((e) => (
              <span
                key={e.prenom}
                style={{ left: e.left }}
                className="absolute top-[66%] flex w-[24%] flex-col gap-0.5 rounded-md bg-[rgba(23,12,58,0.82)] px-[7px] py-1.5 leading-[1.15] text-white"
              >
                <b className="text-[max(12px,3.6cqw)]">{e.prenom}</b>
                <span className="text-[max(10px,2.9cqw)] text-white/80">{e.metier}</span>
              </span>
            ))}
          </div>

          <p className="flex items-center gap-2 text-[13px] opacity-80">
            <Lock className="size-4 shrink-0" aria-hidden />
            Espace sécurisé, réservé aux membres de votre entreprise
          </p>
        </aside>

        <div className="order-1 flex flex-col justify-center gap-4 p-8 md:order-2 md:px-[52px] md:py-12">
          {children}
        </div>
      </div>
    </main>
  );
}

/** Titre + sous-titre d'un écran d'authentification. */
export function AuthHeading({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-[30px] leading-[1.15] font-semibold tracking-[-0.02em]">{title}</h2>
      {children ? <p className="mt-1.5 text-[15px] text-ink-2">{children}</p> : null}
    </div>
  );
}
