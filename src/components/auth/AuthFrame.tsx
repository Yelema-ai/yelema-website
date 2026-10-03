import { Lock } from "lucide-react";
import { branding } from "@/config/branding";

const FACES = [
  { key: "fatima", name: "Fatima", role: "Marketing et contenu" },
  { key: "ibrahim", name: "Ibrahim", role: "Juridique et conformité" },
  { key: "djeneba", name: "Djénéba", role: "Chief of Staff" },
];

// The two-panel card every signed-out page sits in: the Yelema pitch on the left (hidden on
// phones), the form on the right.
export function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4 sm:p-8">
      <div className="grid w-full max-w-[1080px] overflow-hidden rounded-[28px] bg-surface shadow-[0_40px_80px_-40px_rgba(23,17,43,.35)] md:grid-cols-2">
        <aside className="relative hidden flex-col bg-gradient-to-b from-[#301667] to-[#22104a] p-8 text-white md:flex">
          <div className="inline-flex w-fit items-center rounded-xl bg-white px-3 py-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={branding.logoUrl} alt={branding.appName} className="h-7 w-auto" />
          </div>
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
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/experts/pied/${f.key}.jpg`} alt="" className="h-full w-full object-cover object-top" />
                <div className="absolute inset-x-2 bottom-8 rounded-lg bg-[#1a0d3a]/80 px-2 py-1.5">
                  <p className="text-[13px] font-bold">{f.name}</p>
                  <p className="text-[11px] leading-tight text-white/75">{f.role}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-8 flex items-center gap-2 text-[13px] text-white/75">
            <Lock className="h-4 w-4" /> Espace sécurisé, réservé aux membres de votre entreprise
          </p>
        </aside>
        <main className="flex flex-col justify-center px-6 py-10 sm:px-12">
          <div className="mb-8 md:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={branding.logoUrl} alt={branding.appName} className="h-8 w-auto" />
          </div>
          <div className="mx-auto w-full max-w-[420px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
