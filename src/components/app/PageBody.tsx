// Zone de contenu « page » : marges et largeur maximale, comme les maquettes (.page).
// Les écrans qui ont besoin de toute la hauteur — l'espace d'un expert, le chat — ne
// l'utilisent pas et occupent directement le <main>.
export function PageBody({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-[1280px] min-w-0 px-4 pt-6 pb-28 sm:px-8">{children}</div>;
}
