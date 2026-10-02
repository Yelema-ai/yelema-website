import Link from "next/link";
import { ExpertAvatar } from "@/components/experts/ExpertAvatar";
import { agentTabPath } from "@/lib/expert-tabs";
import type { Expert } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Une ligne d'Expert. Unité partagée : barre latérale, accueil, et tout écran qui en liste.
 *
 * Le sous-titre suit ce qu'on sait : le métier dès qu'il sera servi, l'instance porteuse en
 * attendant — ce qui reste utile, puisque plusieurs Experts partagent une instance.
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
  const subtitle = expert.role ?? expert.agentName ?? expert.agentId;

  return (
    <Link
      href={agentTabPath(expert.agentId, "chat")}
      title={`${expert.displayName} · ${expert.profileId}${expert.distribution ? ` · ${expert.distribution}` : ""}`}
      className={cn(
        "flex min-h-12 items-center gap-2.5 rounded-xl px-2 text-sm font-semibold hover:bg-soft",
        active && "bg-soft-2",
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
