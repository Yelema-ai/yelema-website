"use client";

import type { AgendaItem, AgendaView } from "@/lib/meetings/agenda";
import { PLATFORM_LABELS, clock, dayHeading } from "@/lib/meetings/labels";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { CheckMark } from "./CheckMark";

function when(item: AgendaItem, now: Date): string {
  const hours = item.end ? `${clock(item.start)} – ${clock(item.end)}` : clock(item.start);
  return [dayHeading(new Date(item.start), now), hours, PLATFORM_LABELS[item.platform]].join(" · ");
}

function outcome(item: AgendaItem, on: boolean, expertName: string, all: boolean): { text: string; tone: string } | null {
  if (!on) return all && item.pending ? { text: `Invitation sans réponse : cochez-la pour que ${expertName} y aille`, tone: "text-ink-3" } : null;
  if (item.status === "failed") return { text: "Pas pu être programmée", tone: "text-ko" };
  if (item.status && item.status !== "scheduled") return { text: `${expertName} y est`, tone: "text-ok" };
  return { text: `${expertName} sera là`, tone: "text-brand-ink" };
}

function Row({
  item,
  on,
  all,
  now,
  disabled,
  expertName,
  onToggle,
}: {
  item: AgendaItem;
  on: boolean;
  all: boolean;
  now: Date;
  disabled: boolean;
  expertName: string;
  onToggle: () => void;
}) {
  const title = item.title ?? `Réunion ${PLATFORM_LABELS[item.platform]}`;
  const result = outcome(item, on, expertName, all);
  return (
    <li>
      <button
        type="button"
        role="checkbox"
        aria-checked={on}
        aria-label={`${expertName} vient à ${title}`}
        disabled={disabled}
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-1 py-3 text-left transition-colors hover:bg-soft disabled:opacity-60"
      >
        <CheckMark on={on} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold text-ink">{title}</span>
          <span className="block truncate text-[12px] text-ink-3">{when(item, now)}</span>
          {result && <span className={cn("block text-[12px] font-semibold", result.tone)}>{result.text}</span>}
        </span>
      </button>
    </li>
  );
}

export function ChooseMeetingsDialog({
  open,
  onOpenChange,
  expertName,
  view,
  settling,
  isOn,
  onToggle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expertName: string;
  view: AgendaView | null;
  settling: boolean;
  isOn: (key: string) => boolean;
  onToggle: (key: string) => void;
}) {
  const now = new Date();
  const events = view?.events ?? [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] gap-3 overflow-hidden p-5 max-sm:bottom-0 max-sm:top-auto max-sm:w-full max-sm:max-w-none max-sm:translate-y-0 max-sm:rounded-b-none sm:max-w-lg">
        <div className="pr-8">
          <DialogTitle className="text-[17px] font-bold text-ink">Choisir les réunions de {expertName}</DialogTitle>
          <DialogDescription className="mt-1 text-[13px] text-ink-3">
            {view?.mode === "all"
              ? "« Toutes mes réunions » est activé : les réunions que vous avez créées ou acceptées. Décocher une réunion le désactive : les nouvelles réunions ne seront plus ajoutées."
              : `Vos réunions Meet et Teams des 14 prochains jours. ${expertName} rejoint celles que vous cochez, à l’heure prévue.`}
          </DialogDescription>
        </div>
        <div className="min-h-0 overflow-y-auto">
          {view?.unavailable ? (
            <p className="py-8 text-center text-[13px] text-ko">Votre agenda n’a pas pu être lu. Réessayez dans un instant.</p>
          ) : events.length ? (
            <ul className="divide-y divide-line">
              {events.map((item) => (
                <Row
                  key={item.key}
                  item={item}
                  on={isOn(item.key)}
                  all={view?.mode === "all"}
                  now={now}
                  disabled={settling}
                  expertName={expertName}
                  onToggle={() => onToggle(item.key)}
                />
              ))}
            </ul>
          ) : (
            <p className="py-8 text-center text-[13px] text-ink-3">Aucune réunion Meet ou Teams dans les 14 prochains jours.</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-brand px-4 text-sm font-semibold text-on-brand hover:opacity-90"
        >
          Terminé
        </button>
      </DialogContent>
    </Dialog>
  );
}
