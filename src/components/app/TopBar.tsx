"use client";

import { settingsEntry } from "@/components/settings/settings-nav";
import { usePathname } from "next/navigation";
import { ChevronRight, Menu } from "lucide-react";
import { NotificationBell } from "@/components/app/NotificationBell";
import { AppearanceSync } from "@/components/app/AppearanceSync";
import { YeleTopButton } from "@/components/yele/YeleBubble";
import { useExpertsContext } from "@/components/experts/ExpertsProvider";
import { parseAgentRoute } from "@/lib/expert-tabs";
import type { Expert } from "@/lib/types";
import { cn } from "@/lib/utils";

// The breadcrumb comes from the path: no page pushes it, so it cannot drift from where the user is.
function crumbs(pathname: string, experts: Expert[]): string[] {
  if (pathname === "/") return ["Accueil"];
  if (pathname === "/conversations") return ["Toutes les conversations"];
  if (pathname === "/recruter") return ["Recruter"];
  if (pathname.startsWith("/recruter/")) return ["Recruter", "Fiche de poste"];
  if (pathname.startsWith("/integrations/connecteurs")) return ["Intégrations", "Connecteurs"];
  if (pathname.startsWith("/integrations/canaux")) return ["Intégrations", "Canaux"];
  if (pathname.startsWith("/integrations/emails")) return ["Intégrations", "E-mails"];
  if (pathname.startsWith("/integrations/modeles")) return ["Intégrations", "Modèles"];
  if (pathname.startsWith("/integrations/mcp")) return ["Intégrations", "MCP"];
  if (pathname.startsWith("/integrations/identifiants")) return ["Intégrations", "Accès aux sites"];
  if (pathname.startsWith("/integrations")) return ["Intégrations"];
  if (pathname.startsWith("/parametres")) {
    const entry = settingsEntry(pathname);
    return entry ? ["Paramètres", entry.label] : ["Paramètres"];
  }
  if (pathname.startsWith("/experts/")) {
    const [, agentId, ...rest] = pathname.split("/").filter(Boolean);
    const profileId = parseAgentRoute(rest)?.profileId;
    const expert = experts.find((e) => e.agentId === agentId && e.profileId === profileId);
    // Without a profile, the instance's default home: the chat d'entreprise.
    if (!profileId) return ["Chat d’entreprise"];
    return ["Mes Experts", expert ? expert.displayName : "Espace expert"];
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
          // On a phone only the page's own name: the trail would be cut to a few letters each.
          <span key={i} className={cn("flex min-w-0 items-center gap-1.5", i < trail.length - 1 && "max-sm:hidden")}>
            {i > 0 && <ChevronRight className="size-4 shrink-0 max-sm:hidden" />}
            <span className={cn("truncate", i === trail.length - 1 && "font-semibold text-ink")}>{c}</span>
          </span>
        ))}
      </div>
      <AppearanceSync />
      <span className="ml-auto" />
      <YeleTopButton />
      <NotificationBell />
    </header>
  );
}
