"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { House, LayoutDashboard, PanelLeftClose, Settings2, UserPlus } from "lucide-react";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { usePublicConfig } from "@/components/PublicConfigProvider";
import { AccountMenu } from "@/components/AccountMenu";
import { useExpertsContext } from "@/components/experts/ExpertsProvider";
import { ExpertItem } from "@/components/experts/ExpertItem";
import { cn } from "@/lib/utils";

// Le menu des maquettes. L'entrée sans écran reste visible mais inerte : on montre la forme du
// produit sans promettre une page qui n'existe pas (décision du 2 octobre 2026). Pas de « Chat
// entreprise » : chaque membre a sa propre instance, il n'y a pas de discussion commune.
const NAV = [
  { href: "/", label: "Accueil", icon: House, exact: true },
  { href: null, label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/recruter", label: "Recruter", icon: UserPlus },
] as const;

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const { current } = useWorkspace();
  const { logoUrl } = usePublicConfig();
  const { experts, unreadable } = useExpertsContext();

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-screen flex-col gap-0.5 overflow-y-auto border-r bg-card px-3 py-3.5",
        collapsed && "px-2.5 items-center"
      )}
    >
      <div className={cn("flex items-center gap-1", collapsed && "flex-col")}>
        <Link href="/" className="flex min-w-0 items-center gap-2.5 px-2 pt-1.5 pb-3.5">
          {logoUrl ? (
            // Le logo du client. Yelema reste en pied, en « Powered by ».
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="size-[38px] shrink-0 object-contain" />
          ) : (
            <span className="grid size-[38px] shrink-0 place-items-center rounded-xl bg-tint text-[15px] font-bold text-brand-ink">
              {(current?.name?.trim()[0] ?? "?").toUpperCase()}
            </span>
          )}
          {!collapsed && (
            <span className="min-w-0">
              <b className="block truncate text-[15px]">{current?.name ?? "…"}</b>
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
        const active = item.href ? ("exact" in item && item.exact ? pathname === item.href : pathname.startsWith(item.href)) : false;
        const base =
          "flex min-h-10 items-center gap-2.5 rounded-[11px] px-2.5 text-sm font-semibold transition-colors";
        if (!item.href) {
          return (
            <span
              key={item.label}
              aria-disabled="true"
              title="Bientôt disponible"
              className={cn(base, "cursor-default text-ink-3/55", collapsed && "justify-center px-0")}
            >
              <Icon className="size-[18px] shrink-0" />
              {!collapsed && item.label}
            </span>
          );
        }
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
            <Icon className="size-[18px] shrink-0" />
            {!collapsed && item.label}
          </Link>
        );
      })}

      {!collapsed && (
        <div className="px-2.5 pt-4 pb-1.5 text-xs font-semibold text-ink-3">Mon équipe</div>
      )}

      {experts.map((e) => (
        <ExpertItem
          // The same profile can sit on two instances (an admin sees them all): key on both.
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

      <div className="mt-auto flex w-full flex-col gap-0.5 border-t pt-3">
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
          <Settings2 className="size-[18px] shrink-0" />
          {!collapsed && "Administration"}
        </Link>

        <AccountMenu collapsed={collapsed} />

        <a
          href="https://yelema.ai"
          target="_blank"
          rel="noopener"
          className={cn(
            "mt-2.5 flex items-center justify-center gap-2 rounded-[14px] bg-soft px-2.5 py-3 text-xs font-semibold text-ink-3",
            collapsed && "px-0"
          )}
        >
          {!collapsed && "Powered by"}
          <Image src="/yelema-long.png" alt="Yelema" width={78} height={22} className="h-[22px] w-auto" />
        </a>
      </div>
    </aside>
  );
}
