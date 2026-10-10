"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { House, PanelLeftClose, Settings2, UserPlus } from "lucide-react";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { usePublicConfig } from "@/components/PublicConfigProvider";
import { AccountMenu } from "@/components/AccountMenu";
import { useExpertsContext } from "@/components/experts/ExpertsProvider";
import { ExpertItem } from "@/components/experts/ExpertItem";
import { cn } from "@/lib/utils";

// Pas de « Chat entreprise » : chaque membre a sa propre instance, il n'y a pas de discussion
// commune. Une entrée n'apparaît ici que lorsque son écran existe.
const NAV = [
  { href: "/", label: "Accueil", icon: House, exact: true },
  { href: "/recruter", label: "Recruter", icon: UserPlus, exact: false },
] as const;

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const { current } = useWorkspace();
  const { logoUrl } = usePublicConfig();
  const { experts, unreadable } = useExpertsContext();

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-screen flex-col gap-0.5 overflow-y-auto border-r border-line bg-surface px-3 py-3.5",
        collapsed && "px-2.5 items-center"
      )}
    >
      <div className={cn("flex items-center gap-1", collapsed && "flex-col")}>
        <Link href="/" className="flex min-w-0 items-center gap-2.5 px-2 pt-1.5 pb-3.5">
          {logoUrl ? (
            // Le logo du client. Yelema reste en pied, en « Propulsé par ».
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="size-[38px] shrink-0 rounded-xl object-contain" />
          ) : (
            <span className="grid size-[38px] shrink-0 place-items-center rounded-xl bg-brand font-display text-lg font-bold text-on-brand">
              {(current?.name?.trim()[0] ?? "?").toUpperCase()}
            </span>
          )}
          {!collapsed && (
            <span className="min-w-0">
              <b className="block truncate text-[15px] text-ink">{current?.name ?? "…"}</b>
              <span className="block text-[11px] text-ink-3">Espace de travail</span>
            </span>
          )}
        </Link>
        <button
          onClick={onToggle}
          aria-label={collapsed ? "Déplier le menu" : "Replier le menu"}
          title={collapsed ? "Déplier le menu" : "Replier le menu"}
          className="grid size-[34px] shrink-0 place-items-center rounded-[10px] text-ink-3 hover:bg-soft"
        >
          <PanelLeftClose className={cn("size-[18px]", collapsed && "-scale-x-100")} />
        </button>
      </div>

      {NAV.map((item) => {
        const Icon = item.icon;
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        const base =
          "flex min-h-10 items-center gap-2.5 rounded-[11px] px-2.5 text-sm font-semibold transition-colors";
        return (
          <Link
            key={item.label}
            href={item.href}
            className={cn(
              base,
              active ? "bg-soft-2 text-ink" : "text-ink-2 hover:bg-soft",
              collapsed && "justify-center px-0"
            )}
          >
            <Icon className="size-5 shrink-0" strokeWidth={1.9} />
            {!collapsed && item.label}
          </Link>
        );
      })}

      {!collapsed && (
        <div className="px-2.5 pt-4 pb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">Mon équipe</div>
      )}

      {experts.map((e) => (
        <ExpertItem
          // Keyed on instance and profile: a profile name alone is not unique across instances.
          key={`${e.agentId}:${e.profileId}`}
          expert={e}
          active={pathname === `/experts/${e.agentId}/${e.profileId}` || pathname.startsWith(`/experts/${e.agentId}/${e.profileId}/`)}
          compact={collapsed}
        />
      ))}

      {/* Une instance illisible ne doit pas raccourcir la liste en silence. */}
      {!collapsed && unreadable > 0 && (
        <p className="px-2.5 py-1.5 text-xs text-ink-3">
          {unreadable === 1 ? "1 instance illisible" : `${unreadable} instances illisibles`}
        </p>
      )}

      <div className="mt-auto flex w-full flex-col gap-0.5 border-t border-line pt-3">
        <Link
          href="/administration"
          className={cn(
            "flex min-h-10 items-center gap-2.5 rounded-[11px] px-2.5 text-sm font-semibold transition-colors",
            pathname.startsWith("/administration")
              ? "bg-soft-2 text-ink"
              : "text-ink-2 hover:bg-soft",
            collapsed && "justify-center px-0"
          )}
        >
          <Settings2 className="size-5 shrink-0" strokeWidth={1.9} />
          {!collapsed && "Administration"}
        </Link>

        <AccountMenu collapsed={collapsed} />

        <a
          href="https://yelema.ai"
          target="_blank"
          rel="noopener"
          className={cn(
            "mt-1 flex items-center justify-center gap-2 rounded-xl bg-soft px-2.5 py-2.5 text-xs text-ink-3",
            collapsed && "px-0"
          )}
        >
          {!collapsed && "Propulsé par"}
          <Image src="/yelema-long.png" alt="Yelema" width={55} height={16} className="h-4 w-auto" />
        </a>
      </div>
    </aside>
  );
}
