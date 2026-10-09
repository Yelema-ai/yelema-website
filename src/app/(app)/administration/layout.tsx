"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/administration", label: "Membres", exact: true, adminOnly: true },
  { href: "/administration/instances", label: "Instances", exact: false, adminOnly: true },
  { href: "/administration/connecteurs", label: "Connecteurs", exact: false, adminOnly: false },
  { href: "/administration/canaux", label: "Canaux", exact: false, adminOnly: false },
];

// Le cadre de l'administration. Membres et Instances, pour les admins, sont deux listes à lire :
// tout s'y gère dans le back-office Yelema. Connecteurs et Canaux, pour chacun, règlent sa propre
// instance.
export default function AdministrationLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { current } = useWorkspace();
  const tabs = TABS.filter((t) => !t.adminOnly || current?.role === "admin");

  return (
    <>
      {tabs.length > 1 && (
        <nav aria-label="Administration" className="mx-auto flex w-full max-w-[1280px] gap-1 overflow-x-auto border-b border-line px-4 pt-4 sm:px-8">
          {tabs.map((tab) => {
            const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
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
      )}
      {children}
    </>
  );
}
