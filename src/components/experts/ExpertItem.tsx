import Link from "next/link";
import { ExpertAvatar } from "@/components/experts/ExpertAvatar";
import { agentTabPath } from "@/lib/expert-tabs";
import type { Expert } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Une ligne d'Expert. Unité partagée : barre latérale, accueil, et tout écran qui en liste.
 *
 * Le sous-titre suit ce qu'on sait : le métier que donne le catalogue, sinon le nom de l'instance.
 *
 * `compact` n'affiche que le visage (menu replié).
 */
export function ExpertItem({
  expert,
  active = false,
  compact = false,
  className,
}: {
  expert: Expert;
  active?: boolean;
  compact?: boolean;
  className?: string;
}) {
  // Never the profile or instance id: a member has no use for either.
  const subtitle = expert.title ?? expert.role ?? expert.agentName ?? "";

  return (
    <Link
      href={agentTabPath(expert.agentId, "chat", expert.profileId)}
      title={expert.displayName}
      className={cn(
        "flex min-h-12 items-center gap-2.5 rounded-[11px] px-2 text-sm font-semibold transition-colors",
        active ? "bg-soft-2 text-ink" : "text-ink-2 hover:bg-soft",
        compact && "justify-center px-0",
        className
      )}
    >
      <ExpertAvatar expert={expert} />
      {!compact && (
        <span className="min-w-0 grow">
          <span className="block truncate">{expert.displayName}</span>
          <small className="block truncate text-xs font-medium text-ink-3">{subtitle}</small>
        </span>
      )}
    </Link>
  );
}
