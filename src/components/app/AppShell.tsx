"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Check,
  ChevronRight,
  FolderOpen,
  Home,
  LogOut,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Settings,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { EXPERTS, getExpert } from "@/config/experts";
import { branding } from "@/config/branding";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useApp } from "./AppProvider";
import { ExpertAvatar, WorkspaceLogo } from "./ExpertAvatar";

const NAV = [
  { href: "/accueil", label: "Accueil", icon: Home },
  { href: "/chat", label: "Chat entreprise", icon: MessageCircle },
  { href: "/fichiers", label: "Fichiers", icon: FolderOpen },
  { href: "/recruter", label: "Recruter", icon: UserPlus },
];

const SETTINGS_LABELS: Record<string, string> = {
  equipe: "Équipe",
  connecteurs: "Connecteurs",
  canaux: "Canaux",
};

// The breadcrumb for the top bar, from the path.
function crumbs(pathname: string): string[] {
  const [first, second] = pathname.split("/").filter(Boolean);
  if (first === "experts") return ["Mon équipe", getExpert(second ?? "")?.name ?? ""];
  if (first === "parametres") return ["Paramètres", SETTINGS_LABELS[second ?? ""] ?? ""];
  if (first === "recruter" && second) return ["Recruter", getExpert(second)?.name ?? ""];
  const nav = NAV.find((n) => n.href === `/${first}`);
  return [nav?.label ?? ""];
}

function SidebarLink({
  href,
  active,
  children,
  className,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-10 items-center gap-2.5 rounded-[11px] px-2.5 text-sm font-semibold transition-colors",
        active ? "bg-soft-2 text-ink" : "text-ink-2 hover:bg-soft",
        className
      )}
    >
      {children}
    </Link>
  );
}

function AccountMenu() {
  const router = useRouter();
  const { user, workspace, workspaces } = useApp();

  async function switchTo(id: string) {
    if (id === workspace.id) return;
    try {
      await apiFetch("/api/workspaces/current", { method: "POST", body: JSON.stringify({ id }) });
      router.push("/accueil");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function signOut() {
    await createClient().auth.signOut();
    window.location.href = "/login";
  }

  const initial = (user.name.trim()[0] ?? user.email[0] ?? "?").toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-soft"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand text-[13px] font-bold text-on-brand">
            {initial}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-ink">{user.name || user.email}</span>
            <span className="block truncate text-xs text-ink-3">{user.email}</span>
          </span>
          <MoreHorizontal className="h-4 w-4 shrink-0 text-ink-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-60">
        {workspaces.length > 1 && (
          <>
            <DropdownMenuLabel className="text-xs text-ink-3">Changer d’espace</DropdownMenuLabel>
            {workspaces.map((w) => (
              <DropdownMenuItem key={w.id} onSelect={() => switchTo(w.id)}>
                <span className="flex-1 truncate">{w.name}</span>
                {w.id === workspace.id && <Check className="h-4 w-4" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onSelect={signOut}>
          <LogOut className="h-4 w-4" /> Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { workspace } = useApp();

  return (
    <nav className="flex h-full flex-col gap-0.5 overflow-y-auto px-3 py-3.5" onClick={onNavigate}>
      <div className="flex items-center gap-2.5 px-2 pb-3.5 pt-1.5">
        <WorkspaceLogo name={workspace.name} logoUrl={workspace.logoUrl} />
        <div className="min-w-0">
          <b className="block truncate text-[15px] text-ink">{workspace.name}</b>
          <span className="block text-[11px] text-ink-3">Espace de travail</span>
        </div>
      </div>

      {NAV.map((item) => {
        const Icon = item.icon;
        return (
          <SidebarLink key={item.href} href={item.href} active={pathname.startsWith(item.href)}>
            <Icon className="h-5 w-5 shrink-0" strokeWidth={1.9} />
            {item.label}
          </SidebarLink>
        );
      })}

      <div className="px-2.5 pb-1.5 pt-4 text-xs font-semibold uppercase tracking-wide text-ink-3">Mon équipe</div>
      {EXPERTS.map((e) => (
        <SidebarLink key={e.key} href={`/experts/${e.key}`} active={pathname.startsWith(`/experts/${e.key}`)} className="min-h-12 px-2">
          <ExpertAvatar expertKey={e.key} />
          <span className="min-w-0">
            <span className="block truncate">{e.name}</span>
            <span className="block truncate text-xs font-medium text-ink-3">{e.title}</span>
          </span>
        </SidebarLink>
      ))}

      <div className="mt-auto flex flex-col gap-0.5 border-t border-line pt-3">
        <SidebarLink href="/parametres/equipe" active={pathname.startsWith("/parametres")}>
          <Settings className="h-5 w-5 shrink-0" strokeWidth={1.9} />
          Paramètres
        </SidebarLink>
        <AccountMenu />
        <div className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-soft py-2.5 text-xs text-ink-3">
          Powered by
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={branding.logoUrl} alt={branding.appName} className="h-4 w-auto" />
        </div>
      </div>
    </nav>
  );
}

// The signed-in frame: the left menu (client, sections, the 11 experts, settings, account), a top
// bar with the breadcrumb, and the page. Below 760px the menu becomes a drawer.
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const trail = crumbs(pathname);

  useEffect(() => setDrawer(false), [pathname]);

  return (
    <div className="min-h-screen md:grid md:grid-cols-[272px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen border-r border-line bg-surface md:block">
        <Sidebar />
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button type="button" aria-label="Fermer le menu" className="absolute inset-0 bg-ink/40" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 w-[284px] bg-surface shadow-xl">
            <Sidebar />
            <button
              type="button"
              onClick={() => setDrawer(false)}
              aria-label="Fermer le menu"
              className="absolute right-3 top-4 grid h-9 w-9 place-items-center rounded-full text-ink-3 hover:bg-soft"
            >
              <X className="h-5 w-5" />
            </button>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-[62px] shrink-0 items-center gap-2.5 border-b border-line bg-bg/85 px-4 backdrop-blur md:px-6">
          <button
            type="button"
            onClick={() => setDrawer(true)}
            aria-label="Ouvrir le menu"
            className="grid h-10 w-10 place-items-center rounded-full border border-line bg-surface md:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex min-w-0 items-center gap-1.5 text-sm text-ink-3">
            {trail.map((c, i) => (
              <span key={i} className="flex min-w-0 items-center gap-1.5">
                {i > 0 && <ChevronRight className="h-4 w-4 shrink-0" />}
                <span className={cn("truncate", i === trail.length - 1 && "font-semibold text-ink")}>{c}</span>
              </span>
            ))}
          </div>
          <Link
            href="/parametres/equipe?ajouter=1"
            className="ml-auto inline-flex h-[38px] items-center gap-2 whitespace-nowrap rounded-full border border-line bg-surface px-3 text-[13px] font-semibold text-ink hover:bg-soft"
          >
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Inviter un collègue</span>
          </Link>
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
