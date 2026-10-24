"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Bell, MoreHorizontal, LogOut, Settings2, UserRound } from "lucide-react";
import { askNotificationPermission, notificationSupport, type NotificationSupport } from "@/components/activity/system-notify";
import { signOutEverywhere, useSupabase } from "@/lib/supabase/client";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { usePublicConfig } from "@/components/PublicConfigProvider";
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
  const { current, userEmail, userName, userAvatarUrl } = useWorkspace();
  // The profile is the back office's: only there can the user change their own name.
  const editable = usePublicConfig().authVia === "backoffice";
  // Offered while the browser has not been asked yet; read after mount (no window on the server).
  const [notif, setNotif] = useState<NotificationSupport>("unsupported");
  useEffect(() => setNotif(notificationSupport()), []);

  async function enableNotifications() {
    const next = await askNotificationPermission();
    setNotif(next);
    if (next === "granted") toast.success("Notifications activées : vous serez prévenu quand un Expert répond.");
    else if (next === "denied") toast.info("Notifications refusées. Vous pouvez les autoriser dans les réglages du navigateur.");
  }

  const shown = userName ?? userEmail;
  const initial = (shown.trim()[0] ?? "?").toUpperCase();

  async function signOut() {
    await signOutEverywhere(supabase);
    window.location.href = "/login?out=1";
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left text-ink transition-colors hover:bg-soft",
          collapsed && "w-auto justify-center px-1"
        )}
      >
        <Face url={userAvatarUrl} initial={initial} />
        {!collapsed && (
          <>
            <span className="min-w-0 grow">
              <span className="block truncate text-sm font-semibold text-ink">{shown}</span>
              <small className="block truncate text-xs text-ink-3">
                {current?.role === "admin" ? "Administrateur" : "Membre"}
              </small>
            </span>
            <MoreHorizontal className="size-4 shrink-0 text-ink-3" />
          </>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" side="top" className="w-60 p-1.5">
        <div className="flex items-center gap-2.5 border-b border-line px-2.5 pt-2.5 pb-3">
          <Face url={userAvatarUrl} initial={initial} />
          <span className="min-w-0">
            <b className="block truncate text-sm">{shown}</b>
            {userName && <small className="block truncate text-xs text-ink-3">{userEmail}</small>}
            <small className="block truncate text-xs text-ink-3">{current?.name}</small>
          </span>
        </div>

        {editable && (
          <DropdownMenuItem asChild className="mt-1.5 gap-2.5 rounded-[10px] px-2.5 py-2 text-sm">
            <Link href="/parametres/profil">
              <UserRound className="size-4" />
              Mon profil
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild className={cn("gap-2.5 rounded-[10px] px-2.5 py-2 text-sm", !editable && "mt-1.5")}>
          <Link href="/parametres">
            <Settings2 className="size-4" />
            Paramètres
          </Link>
        </DropdownMenuItem>

        {notif === "default" && (
          <DropdownMenuItem onSelect={enableNotifications} className="gap-2.5 rounded-[10px] px-2.5 py-2 text-sm">
            <Bell className="size-4" />
            Activer les notifications
          </DropdownMenuItem>
        )}

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

// The user's photo when they chose one, else their initial.
function Face({ url, initial }: { url: string | null; initial: string }) {
  return (
    <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-brand text-[13px] font-bold text-on-brand">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        initial
      )}
    </span>
  );
}
