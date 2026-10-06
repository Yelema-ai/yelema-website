"use client";

import Link from "next/link";
import { ChevronsUpDown, LogOut, Settings2 } from "lucide-react";
import { signOutEverywhere, useSupabase } from "@/lib/supabase/client";
import { useWorkspace } from "@/components/WorkspaceProvider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// Le bloc de compte, en pied de menu (maquettes : .acw / .me / .acm). Il nomme l'organisation
// mais n'offre ni bascule ni création d'espace : un déploiement sert un client, dont l'unique
// espace appartient au back-office.
export function AccountMenu({ collapsed = false }: { collapsed?: boolean }) {
  const supabase = useSupabase();
  const { current, userEmail } = useWorkspace();

  const initial = (userEmail.trim()[0] ?? "?").toUpperCase();

  async function signOut() {
    await signOutEverywhere(supabase);
    window.location.href = "/login?out=1";
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "mt-1 flex w-full items-center gap-2.5 rounded-[14px] px-2.5 py-2 text-left text-ink hover:bg-soft-2",
          collapsed && "w-auto justify-center px-1"
        )}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand text-[13px] font-bold text-white">
          {initial}
        </span>
        {!collapsed && (
          <>
            <span className="min-w-0 grow">
              <b className="block truncate text-sm">{userEmail}</b>
              <small className="block truncate text-xs text-ink-3">
                {current?.role === "admin" ? "Administrateur" : "Membre"}
              </small>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-ink-3" />
          </>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" side="top" className="w-[272px] rounded-2xl p-1.5">
        <div className="flex items-center gap-2.5 border-b px-2.5 pt-2.5 pb-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand text-[13px] font-bold text-white">
            {initial}
          </span>
          <span className="min-w-0">
            <b className="block truncate text-sm">{current?.name}</b>
            <small className="block truncate text-xs text-ink-3">{userEmail}</small>
          </span>
        </div>

        <DropdownMenuItem asChild className="mt-1.5 gap-2.5 rounded-[10px] px-2.5 py-2 text-sm">
          <Link href="/administration">
            <Settings2 className="size-4" />
            Administration
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="mx-1 my-1.5" />

        <DropdownMenuItem
          onClick={signOut}
          className="gap-2.5 rounded-[10px] px-2.5 py-2 text-sm text-ko focus:text-ko"
        >
          <LogOut className="size-4" />
          Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
