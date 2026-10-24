"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePublicConfig } from "@/components/PublicConfigProvider";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { SETTINGS_GROUPS, settingsEntry } from "@/components/settings/settings-nav";
import { cn } from "@/lib/utils";

// Paramètres : la liste à gauche (Personnel, puis Entreprise pour l'admin), la page à droite. Sur
// téléphone la liste devient une rangée qui défile, l'entrée ouverte ramenée à l'écran.
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { current } = useWorkspace();
  const { authVia } = usePublicConfig();
  const admin = current?.role === "admin";
  const active = settingsEntry(pathname);
  const groups = SETTINGS_GROUPS.map((g) => ({
    ...g,
    entries: g.entries.filter((e) => (!e.adminOnly || admin) && (!e.backoffice || authVia === "backoffice")),
  })).filter((g) => g.entries.length > 0);

  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    nav.current?.querySelector<HTMLElement>("[aria-current=page]")?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [pathname]);

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col lg:flex-row">
      <aside className="shrink-0 lg:w-60 lg:border-r lg:border-line lg:py-6 lg:pl-8 lg:pr-4">
        <h1 className="px-4 pt-6 font-display text-[30px] font-bold tracking-tight text-ink lg:px-2.5 lg:pt-0">Paramètres</h1>
        <nav
          ref={nav}
          aria-label="Paramètres"
          className="mt-2 flex gap-1 overflow-x-auto border-b border-line px-4 [scrollbar-width:none] lg:mt-5 lg:flex-col lg:gap-5 lg:overflow-visible lg:border-0 lg:px-0 [&::-webkit-scrollbar]:hidden"
        >
          {groups.map((g) => (
            <div key={g.label} className="flex shrink-0 gap-1 lg:flex-col lg:gap-0.5">
              <p className="px-2.5 pb-1 text-xs font-semibold uppercase tracking-wide text-ink-3 max-lg:hidden">{g.label}</p>
              {g.entries.map((e) => {
                const on = active?.href === e.href;
                const Icon = e.icon;
                return (
                  <Link
                    key={e.href}
                    href={e.href}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "flex shrink-0 items-center gap-2.5 text-sm font-semibold transition-colors",
                      "max-lg:-mb-px max-lg:border-b-2 max-lg:px-3 max-lg:py-2.5",
                      "lg:min-h-10 lg:rounded-[11px] lg:px-2.5",
                      on ? "text-ink max-lg:border-brand lg:bg-soft-2" : "text-ink-3 hover:text-ink max-lg:border-transparent lg:text-ink-2 lg:hover:bg-soft"
                    )}
                  >
                    <Icon className="size-[18px] shrink-0 max-lg:hidden" strokeWidth={1.9} />
                    {e.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        {active && <h2 className="mx-auto w-full max-w-[1280px] px-4 pt-6 font-display text-[22px] font-bold tracking-tight text-ink sm:px-8">{active.label}</h2>}
        {children}
      </div>
    </div>
  );
}
