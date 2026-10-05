"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/administration", label: "Espace", exact: true },
  { href: "/administration/membres", label: "Membres" },
  { href: "/administration/agents", label: "Instances" },
];

// Le cadre de l'administration : les onglets Espace / Membres / Instances au-dessus de la page.
export default function AdministrationLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <>
      <nav aria-label="Administration" className="mx-auto flex w-full max-w-[1280px] gap-1 overflow-x-auto border-b px-4 pt-4 sm:px-8">
        {TABS.map((tab) => {
          const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors",
                active ? "border-primary text-ink" : "border-transparent text-ink-3 hover:text-ink"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </>
  );
}
