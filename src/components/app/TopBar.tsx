"use client";

import { usePathname } from "next/navigation";
import { ChevronRight, Menu } from "lucide-react";
import { ThemeMenu } from "@/components/app/ThemeMenu";
import { useExpertsContext } from "@/components/experts/ExpertsProvider";
import { parseAgentRoute } from "@/lib/expert-tabs";
import type { Expert } from "@/lib/types";
import { cn } from "@/lib/utils";

// The breadcrumb comes from the path: no page pushes it, so it cannot drift from where the user is.
function crumbs(pathname: string, experts: Expert[]): string[] {
  if (pathname === "/") return ["Accueil"];
  if (pathname === "/recruter") return ["Recruter"];
  if (pathname.startsWith("/recruter/")) return ["Recruter", "Fiche de poste"];
  if (pathname.startsWith("/administration/instances")) return ["Administration", "Instances"];
  if (pathname.startsWith("/administration/connecteurs")) return ["Administration", "Connecteurs"];
  if (pathname.startsWith("/administration/canaux")) return ["Administration", "Canaux"];
  if (pathname.startsWith("/administration")) return ["Administration", "Membres"];
  if (pathname.startsWith("/experts/")) {
    const [, agentId, ...rest] = pathname.split("/").filter(Boolean);
    const profileId = parseAgentRoute(rest)?.profileId;
    const expert = experts.find((e) => e.agentId === agentId && e.profileId === profileId);
    return ["Mon équipe", expert ? expert.displayName : "Espace expert"];
  }
  return [];
}

export function TopBar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const { experts } = useExpertsContext();
  const trail = crumbs(pathname, experts);
  return (
    <header className="sticky top-0 z-30 flex h-[62px] shrink-0 items-center gap-2.5 border-b border-line bg-bg/85 px-4 backdrop-blur md:px-6">
      <button
        type="button"
        onClick={onMenu}
        aria-label="Ouvrir le menu"
        className="grid size-10 shrink-0 place-items-center rounded-full border border-line bg-surface md:hidden"
      >
        <Menu className="size-5" />
      </button>
      <div className="flex min-w-0 items-center gap-1.5 text-sm text-ink-3">
        {trail.map((c, i) => (
          <span key={i} className="flex min-w-0 items-center gap-1.5">
            {i > 0 && <ChevronRight className="size-4 shrink-0" />}
            <span className={cn("truncate", i === trail.length - 1 && "font-semibold text-ink")}>{c}</span>
          </span>
        ))}
      </div>
      <ThemeMenu />
    </header>
  );
}
