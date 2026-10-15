"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePublicConfig } from "@/components/PublicConfigProvider";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/integrations/connecteurs", label: "Connecteurs", exact: false, adminOnly: false },
  { href: "/integrations/canaux", label: "Canaux", exact: false, adminOnly: false },
  { href: "/integrations/emails", label: "E-mails", exact: false, adminOnly: true, backoffice: true },
  { href: "/integrations/modeles", label: "Modèles", exact: false, adminOnly: false, backoffice: true },
  { href: "/integrations/mcp", label: "MCP", exact: false, adminOnly: false },
];

export default function IntegrationsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { current } = useWorkspace();
  const { authVia } = usePublicConfig();
  const tabs = TABS.filter(
    (t) => (!t.adminOnly || current?.role === "admin") && (!("backoffice" in t) || authVia === "backoffice")
  );

  return (
    <>
      {tabs.length > 1 && (
        <nav aria-label="Intégrations" className="mx-auto flex w-full max-w-[1280px] shrink-0 gap-1 overflow-x-auto border-b border-line px-4 pt-4 sm:px-8">
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
