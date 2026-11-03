"use client";

import { AlertTriangle, Bell, CheckCheck, MessageSquare, Repeat, SquarePen, type LucideIcon } from "lucide-react";
import { useNotifications } from "@/components/activity/ActivityProvider";
import { ExpertAvatar } from "@/components/experts/ExpertAvatar";
import { useExpertsContext } from "@/components/experts/ExpertsProvider";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { expertKey, routineDoneTitle, type NotificationItem } from "@/lib/activity";
import { isAccountToTopUp } from "@/lib/chat-errors";
import { expertDisplayName } from "@/lib/experts";
import { relativeFr } from "@/lib/fr-dates";
import { cn } from "@/lib/utils";

// One sign per kind of notification, the same as elsewhere in the app (Repeat for routines).
const KINDS: Record<NotificationItem["kind"], { icon: LucideIcon; label: string; badge: string }> = {
  reply: { icon: MessageSquare, label: "Réponse", badge: "bg-brand text-on-brand" },
  routine: { icon: Repeat, label: "Routine terminée", badge: "bg-ok text-white" },
  failed: { icon: AlertTriangle, label: "Problème", badge: "bg-ko text-white" },
};

// The notification centre, beside the appearance menu: the answers and routine runs the activity
// provider already announces (toasts), kept in a list. A line opens its conversation and reads it.
export function NotificationBell() {
  const { items, open, markAllRead } = useNotifications();
  const { experts } = useExpertsContext();
  const unread = items.filter((i) => i.unread).length;

  const face = (i: NotificationItem) => {
    const e = experts.find((x) => expertKey(x.agentId, x.profileId) === expertKey(i.agentId, i.profile));
    return { displayName: e?.displayName ?? (i.profile ? expertDisplayName(i.profile) : "Expert"), photoUrl: e?.photoUrl ?? null, gateway: null };
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={unread ? `Notifications, ${unread} non lue${unread > 1 ? "s" : ""}` : "Notifications"}
        title="Notifications"
        className="relative grid size-[38px] shrink-0 place-items-center rounded-full border border-line bg-surface text-ink hover:bg-soft"
      >
        <Bell className="size-4" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand px-1 text-[10.5px] font-bold leading-none text-on-brand ring-2 ring-bg">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(380px,calc(100vw-24px))] p-0">
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <span className="text-sm font-bold text-ink">Notifications</span>
          {unread > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand-ink hover:underline pointer-coarse:-my-3 pointer-coarse:min-h-11"
            >
              <CheckCheck className="size-3.5" />
              Tout marquer comme lu
            </button>
          )}
        </div>
        {items.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-ink-3">Aucune notification</p>
        ) : (
          <div className="max-h-[min(460px,70vh)] overflow-y-auto p-1.5">
            {items.map((i) => {
              const who = face(i);
              // The company chat has no Expert behind it: its own sign, the menu's « Nouvelle conversation » pen.
              const company = !i.profile;
              const name = company ? "Chat d’entreprise" : who.displayName;
              const title =
                i.kind === "routine"
                  ? routineDoneTitle(i.routine, i.silent)
                  : i.kind === "failed"
                    ? isAccountToTopUp(i.text)
                      ? "Votre compte d’IA est à recharger"
                      : `${name} : la réponse a échoué`
                    : company
                      ? "Le chat d’entreprise a répondu"
                      : `${who.displayName} a répondu`;
              const detail = i.kind === "routine" ? name : i.text;
              const kind = KINDS[i.kind];
              return (
                <DropdownMenuItem
                  key={i.key}
                  onSelect={() => open(i)}
                  className={cn("items-start gap-3 rounded-xl px-2.5 py-2.5", i.unread && "bg-tint/60 focus:bg-tint")}
                >
                  <span className="relative mt-0.5 shrink-0">
                    {company ? (
                      <span className="grid size-[34px] place-items-center rounded-full bg-brand text-on-brand">
                        <SquarePen className="size-4" strokeWidth={1.9} />
                      </span>
                    ) : (
                      <ExpertAvatar expert={who} size="sm" />
                    )}
                    {/* What happened, as a badge on the face: an answer, a routine run, a failure. */}
                    <span
                      className={cn("absolute -bottom-1 -right-1.5 grid size-5 place-items-center rounded-full ring-2 ring-surface", kind.badge)}
                      title={kind.label}
                    >
                      <kind.icon className="size-3" strokeWidth={2.2} />
                    </span>
                  </span>
                  <span className="min-w-0 grow">
                    <span className="flex items-baseline gap-2">
                      <span className={cn("min-w-0 grow text-[13.5px] leading-snug", i.unread ? "font-semibold text-ink" : "text-ink-2")}>{title}</span>
                      <span className="shrink-0 text-[11.5px] text-ink-3">{relativeFr(i.at)}</span>
                    </span>
                    {detail && <span className="mt-0.5 line-clamp-2 block text-[12.5px] leading-snug text-ink-3">{detail}</span>}
                  </span>
                  {i.unread && <span aria-label="Non lue" className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" />}
                </DropdownMenuItem>
              );
            })}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
