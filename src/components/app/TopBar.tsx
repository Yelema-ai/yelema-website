"use client";

import { usePathname } from "next/navigation";
import { ThemeMenu } from "@/components/app/ThemeMenu";

// Le fil d'Ariane est dérivé du chemin : aucune page n'a à le pousser, et il ne peut pas
// diverger de la navigation réelle.
function crumb(pathname: string): string {
  if (pathname === "/") return "Accueil";
  if (pathname === "/administration") return "Administration";
  if (pathname.startsWith("/administration/membres")) return "Administration · Membres";
  if (pathname.startsWith("/experts/")) return "Espace expert";
  return "";
}

export function TopBar() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-10 flex h-[62px] shrink-0 items-center gap-2.5 border-b bg-[color-mix(in_srgb,var(--background)_86%,transparent)] px-6 backdrop-blur-[10px]">
      <div className="min-w-0 grow truncate text-sm text-ink-3">
        <b className="font-semibold text-ink">{crumb(pathname)}</b>
      </div>
      <ThemeMenu />
    </header>
  );
}
