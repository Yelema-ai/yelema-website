"use client";

import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { ThemeMenu } from "@/components/app/ThemeMenu";
import { useExpertsContext } from "@/components/experts/ExpertsProvider";
import { parseAgentRoute } from "@/lib/expert-tabs";
import type { Expert } from "@/lib/types";

// Le fil d'Ariane est dérivé du chemin : aucune page n'a à le pousser, et il ne peut pas
// diverger de la navigation réelle.
function crumb(pathname: string, experts: Expert[]): string {
  if (pathname === "/") return "Accueil";
  if (pathname === "/recruter") return "Recruter";
  if (pathname.startsWith("/recruter/")) return "Recruter · Fiche de poste";
  if (pathname.startsWith("/administration/instances")) return "Administration · Instances";
  if (pathname.startsWith("/administration")) return "Administration · Membres";
  if (pathname.startsWith("/experts/")) {
    const [, agentId, ...rest] = pathname.split("/").filter(Boolean);
    const profileId = parseAgentRoute(rest)?.profileId;
    const expert = experts.find((e) => e.agentId === agentId && e.profileId === profileId);
    return expert ? expert.displayName : "Espace expert";
  }
  return "";
}

export function TopBar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const { experts } = useExpertsContext();
  return (
    <header className="sticky top-0 z-10 flex h-[62px] shrink-0 items-center gap-2.5 border-b bg-[color-mix(in_srgb,var(--background)_86%,transparent)] px-4 backdrop-blur-[10px] sm:px-6">
      <button
        type="button"
        onClick={onMenu}
        aria-label="Ouvrir le menu"
        className="grid size-[38px] shrink-0 place-items-center rounded-[10px] text-ink-2 hover:bg-soft md:hidden"
      >
        <Menu className="size-5" />
      </button>
      <div className="min-w-0 grow truncate text-sm text-ink-3">
        <b className="font-semibold text-ink">{crumb(pathname, experts)}</b>
      </div>
      <ThemeMenu />
    </header>
  );
}
