"use client";

import { useState } from "react";
import { ChevronDown, Loader2, Paperclip, Repeat, Sparkles } from "lucide-react";
import { relativeFr } from "@/lib/fr-dates";
import { scheduleLabel, type Routine } from "@/lib/routines";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { RowMenu, Switch, type RoutineActions } from "./RoutinesTable";

// The expert's routines as two white cards, as in the mockup: its own (the switch says its state), then
// the ones it proposes (« Voir la consigne » and « Activer »). Same actions as the table, no columns.
export function RoutinesList({ routines, expertName, ...act }: { routines: Routine[]; expertName: string } & RoutineActions) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggleOpen = (id: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const own = routines.filter((r) => !r.suggested);
  const suggested = routines.filter((r) => r.suggested);
  const card = "overflow-hidden rounded-2xl border border-line bg-card";

  const consigne = (r: Routine) =>
    open.has(r.id) && (
      <div className="mx-4 mb-3.5 ml-[4.25rem] rounded-xl bg-soft px-4 py-3 text-[13.5px] leading-relaxed text-ink">
        <p className="whitespace-pre-line">{r.task || r.summary}</p>
        {r.skills.length > 0 && (
          <p className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-ink-3">Compétences</span>
            {r.skills.map((sk) => (
              <span key={sk} className="rounded-full border border-line bg-surface px-2 py-0.5 text-xs text-ink-2">
                {sk}
              </span>
            ))}
          </p>
        )}
        {r.attachment && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-2">
            <Paperclip className="size-3.5" /> {r.attachment.split("/").pop()}
          </p>
        )}
      </div>
    );

  const voir = (r: Routine) => (
    <button
      type="button"
      aria-expanded={open.has(r.id)}
      onClick={() => toggleOpen(r.id)}
      className="inline-flex items-center gap-1 text-[13px] font-semibold text-ink-3 hover:text-ink"
    >
      <ChevronDown className={cn("size-3.5 transition-transform", open.has(r.id) && "rotate-180")} />
      {open.has(r.id) ? "Masquer la consigne" : "Voir la consigne"}
    </button>
  );

  const next = (r: Routine) => {
    const at = r.nextRunAt ? Date.parse(r.nextRunAt) : Number.NaN;
    if (!r.enabled) return " · en pause";
    return !Number.isNaN(at) ? ` · prochaine ${relativeFr(at)}` : "";
  };

  return (
    <div className="mt-5">
      {own.length > 0 && (
        <div className={card}>
          {own.map((r) => {
            const busy = act.busyId === r.id;
            return (
              <div key={r.id} className="border-b border-line last:border-0">
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-tint text-brand-ink">
                    <Repeat className="size-[17px]" />
                  </span>
                  <div className="min-w-0 flex-1 leading-tight">
                    <p className="truncate text-[14.5px] font-semibold text-ink">{r.name}</p>
                    <p className="mt-0.5 truncate text-[12.5px] text-ink-3">
                      {scheduleLabel(r.schedule)}
                      {next(r)}
                    </p>
                  </div>
                  <span className="max-sm:hidden">{voir(r)}</span>
                  <Switch on={r.enabled} label={`${r.enabled ? "Mettre en pause" : "Activer"} ${r.name}`} disabled={busy} onChange={() => act.onToggle(r, !r.enabled)} />
                  <RowMenu routine={r} busy={busy} {...act} />
                </div>
                {consigne(r)}
              </div>
            );
          })}
        </div>
      )}

      {suggested.length > 0 && (
        <>
          <div className="mb-2 mt-7 flex items-center justify-between gap-2">
            <p className="text-[12px] font-bold uppercase tracking-wider text-ink-3">Proposées par {expertName}</p>
            {suggested.length > 1 && (
              <Button size="sm" variant="ghost" disabled={act.bulkBusy} onClick={() => void act.onBulk(suggested, true)}>
                {act.bulkBusy && <Loader2 className="animate-spin" />} Tout activer
              </Button>
            )}
          </div>
          <div className={card}>
            {suggested.map((r) => {
              const busy = act.busyId === r.id;
              return (
                <div key={r.id} className="border-b border-line last:border-0">
                  <div className="flex items-center gap-3 px-4 py-3.5">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-soft text-ink-3">
                      <Sparkles className="size-[17px]" />
                    </span>
                    <div className="min-w-0 flex-1 leading-tight">
                      <p className="truncate text-[14.5px] font-semibold text-ink">{r.name}</p>
                      <p className="mt-0.5 truncate text-[12.5px] text-ink-3">{scheduleLabel(r.schedule)}</p>
                    </div>
                    <span className="max-sm:hidden">{voir(r)}</span>
                    <Button size="sm" disabled={busy} onClick={() => act.onToggle(r, true)}>
                      {busy && <Loader2 className="animate-spin" />} Activer
                    </Button>
                  </div>
                  {consigne(r)}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
