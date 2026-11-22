"use client";

import type { ReactNode } from "react";
import { ChevronRight, Link2, ListChecks, Loader2, Repeat } from "lucide-react";
import type { AgendaView } from "@/lib/meetings/agenda";
import { PLATFORM_LABELS } from "@/lib/meetings/labels";
import { cn } from "@/lib/utils";
import { CheckMark } from "./CheckMark";

function Option({
  icon,
  title,
  text,
  status,
  aside,
  disabled,
  checked,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  status?: string;
  aside: ReactNode;
  disabled?: boolean;
  checked?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role={checked === undefined ? undefined : "checkbox"}
      aria-checked={checked}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-w-0 items-start gap-3 rounded-xl border bg-surface px-3 py-3 text-left transition-colors hover:border-brand/50 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:border-line",
        checked ? "border-brand ring-1 ring-brand" : "border-line"
      )}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-tint text-brand-ink">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold text-ink">{title}</span>
        <span className="mt-0.5 block text-[12px] leading-snug text-ink-2">{text}</span>
        {status && <span className="mt-1 block truncate text-[12px] font-semibold text-ink-3">{status}</span>}
      </span>
      <span className="pt-1.5">{aside}</span>
    </button>
  );
}

function chosenSummary(view: AgendaView, isOn: (key: string) => boolean): string {
  if (view.unavailable) return "Agenda illisible pour le moment";
  const wanted = view.events.filter((e) => isOn(e.key));
  if (!wanted.length) return "Aucune choisie";
  const next = wanted[0];
  return `${wanted.length} ${wanted.length > 1 ? "choisies" : "choisie"} · prochaine : ${next.title ?? `Réunion ${PLATFORM_LABELS[next.platform]}`}`;
}

export function JoinOptions({
  expertName,
  view,
  settling,
  isOn,
  onInvite,
  onAll,
  onChoose,
}: {
  expertName: string;
  view: AgendaView | null;
  settling: boolean;
  isOn: (key: string) => boolean;
  onInvite: () => void;
  onAll: (all: boolean) => void;
  onChoose: () => void;
}) {
  const connected = !!view?.calendar;
  const all = view?.mode === "all";
  return (
    <section aria-label={`Ajouter ${expertName} à vos réunions`} className="flex flex-col gap-2.5">
      <h2 className="text-[15px] font-bold text-ink">Ajouter {expertName} à vos réunions</h2>
      <div className="grid gap-2.5 sm:grid-cols-3">
        <Option
          icon={<Link2 className="size-4" />}
          title="Inviter par lien"
          text={`Collez le lien d’une réunion Meet ou Teams : ${expertName} la rejoint tout de suite.`}
          aside={<ChevronRight className="size-4 shrink-0 text-ink-3" />}
          onClick={onInvite}
        />
        <Option
          icon={<Repeat className="size-4" />}
          title="Toutes mes réunions"
          text={`${expertName} rejoint automatiquement chaque réunion Meet ou Teams de votre agenda, y compris les nouvelles.`}
          status={connected ? undefined : "Connectez un agenda"}
          aside={settling ? <Loader2 className="size-[18px] shrink-0 animate-spin text-brand" /> : <CheckMark on={all} />}
          checked={connected ? all : undefined}
          disabled={!connected || settling}
          onClick={() => onAll(!all)}
        />
        <Option
          icon={<ListChecks className="size-4" />}
          title="Choisir mes réunions"
          text={`Cochez les réunions de votre agenda où ${expertName} doit venir.`}
          status={connected && view ? chosenSummary(view, isOn) : "Connectez un agenda"}
          aside={<ChevronRight className="size-4 shrink-0 text-ink-3" />}
          disabled={!connected || settling}
          onClick={onChoose}
        />
      </div>
    </section>
  );
}
