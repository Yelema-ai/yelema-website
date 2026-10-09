import Image from "next/image";
import Link from "next/link";
import { Lock } from "lucide-react";
import { branding } from "@/config/branding";

// The three faces of the pitch. An illustration of the product, not the client's team: the
// pictures are files in /public/experts/pied.
const FACES = [
  { key: "fatima", name: "Fatima", role: "Marketing et contenu" },
  { key: "ibrahim", name: "Ibrahim", role: "Juridique et conformité" },
  { key: "djeneba", name: "Djénéba", role: "Chief of Staff" },
];

/**
 * The two-panel card every signed-out page sits in: the Yelema pitch on the left (hidden on
 * phones, where the logo sits above the form), the form on the right.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4 sm:p-8">
      <div className="grid w-full max-w-[1080px] overflow-hidden rounded-[28px] bg-surface shadow-[0_40px_80px_-40px_rgba(23,17,43,.35)] md:grid-cols-2">
        {/* Fixed colors on purpose: the pitch is the same violet panel in both themes. */}
        <aside className="relative hidden flex-col bg-gradient-to-b from-[#301667] to-[#22104a] p-8 text-white md:flex">
          <Link href="/login" className="inline-flex w-fit items-center rounded-xl bg-white px-3 py-2">
            <Image src={branding.logoUrl} alt={branding.appName} width={97} height={28} priority className="h-7 w-auto" />
          </Link>
          <h1 className="mt-10 font-display text-[34px] font-bold leading-[1.1] tracking-tight">
            Décuplez les forces
            <br />
            <span className="text-[#C5C4FF]">de votre entreprise.</span>
          </h1>
          <p className="mt-4 max-w-sm text-sm text-white/80">
            Une IA pensée pour l’Afrique, prête à l’emploi, au service de vos équipes.
          </p>
          <div className="mt-8 flex flex-1 items-end justify-center gap-4">
            {FACES.map((f) => (
              <div key={f.key} className="relative h-[300px] w-[110px] overflow-hidden rounded-t-full rounded-b-[60px] bg-[#8D68FA]/40">
                <Image src={`/experts/pied/${f.key}.jpg`} alt="" fill sizes="110px" priority className="object-cover object-top" />
                <div className="absolute inset-x-2 bottom-8 rounded-lg bg-[#1a0d3a]/80 px-2 py-1.5">
                  <p className="text-[13px] font-bold">{f.name}</p>
                  <p className="text-[11px] leading-tight text-white/75">{f.role}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-8 flex items-center gap-2 text-[13px] text-white/75">
            <Lock className="size-4 shrink-0" aria-hidden />
            Espace sécurisé, réservé aux membres de votre entreprise
          </p>
        </aside>

        <main className="flex flex-col justify-center px-6 py-10 sm:px-12">
          <div className="mb-8 md:hidden">
            <span className="inline-flex rounded-xl bg-white px-3 py-2">
              <Image src={branding.logoUrl} alt={branding.appName} width={111} height={32} priority className="h-8 w-auto" />
            </span>
          </div>
          <div className="mx-auto flex w-full max-w-[420px] flex-col gap-5">{children}</div>
        </main>
      </div>
    </div>
  );
}

/** Titre + sous-titre d'un écran d'authentification. */
export function AuthHeading({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div>
      <h2 className="font-display text-[30px] font-bold tracking-tight text-ink">{title}</h2>
      {children ? <p className="mt-2 text-[15px] text-ink-2">{children}</p> : null}
    </div>
  );
}
