"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/parametres/equipe", label: "Équipe" },
  { href: "/parametres/connecteurs", label: "Connecteurs" },
  { href: "/parametres/canaux", label: "Canaux" },
  { href: "/parametres/mcp", label: "MCP" },
];

// The settings frame: the "Paramètres" title and the Équipe / Connecteurs / Canaux / MCP tabs.
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-8">
      <h1 className="font-display text-[34px] font-bold tracking-tight text-ink">Paramètres</h1>
      <nav aria-label="Paramètres" className="mt-4 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((tab) => {
          const active = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors",
                active ? "border-brand text-ink" : "border-transparent text-ink-3 hover:text-ink"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      <div className="pt-6">{children}</div>
    </div>
  );
}
