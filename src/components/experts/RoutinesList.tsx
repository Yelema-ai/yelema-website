"use client";

import { useState } from "react";
import { ChevronDown, Loader2, Paperclip, Repeat, Sparkles, Wrench } from "lucide-react";
import { relativeFr } from "@/lib/fr-dates";
import { deliveryLabel, isUpkeep, nextRunChip, runDayLabel, scheduleLabel, type Routine } from "@/lib/routines";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Check, RowMenu, Switch, type RoutineActions } from "./RoutinesTable";

// The expert's routines as white cards, as in the mockup: its work (the switch says its state), the
// ones it proposes (« Voir la consigne » and « Activer »), then « Entretien » folded at the bottom: the
// upkeep that runs backstage and opens no conversation. Same actions as the table, no columns.
export function RoutinesList({ routines, expertName, ...act }: { routines: Routine[]; expertName: string } & RoutineActions) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggleOpen = (id: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const [upkeepOpen, setUpkeepOpen] = useState(false);
  const upkeep = routines.filter(isUpkeep);
  const work = routines.filter((r) => !isUpkeep(r));
  const own = work.filter((r) => !r.suggested);
  const suggested = work.filter((r) => r.suggested);
  const lastUpkeep = Math.max(...upkeep.map((r) => (r.lastRunAt ? Date.parse(r.lastRunAt) : Number.NaN)).filter((t) => !Number.isNaN(t)));
  const card = "overflow-hidden rounded-2xl border border-line bg-card";

  // Several routines at once (Leslie, 23/11: « sélectionner toutes les routines d'entretien en une fois, et non
  // une par une ») : a box on each row, a bar that acts on the ticked ones, and one button at the head of Travail
  // and of Entretien that turns the whole section on or off.
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const chosen = routines.filter((r) => picked.has(r.id));
  const pick = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  // Pausing never touches a proposed routine: it is not installed, there is nothing to pause.
  const pausable = (list: Routine[]) => list.filter((r) => !r.suggested && r.enabled);
  async function apply(list: Routine[], enabled: boolean) {
    if (await act.onBulk(enabled ? list : pausable(list), enabled)) setPicked(new Set());
  }
  const box = (r: Routine) => <Check on={picked.has(r.id)} label={`Sélectionner ${r.name}`} onChange={() => pick(r.id)} />;
  // « Tout activer » while one routine of the section is off, else « Tout mettre en pause ».
  const allButton = (list: Routine[], what: string) => {
    const allOn = list.every((r) => !r.suggested && r.enabled);
    return (
      <Button size="sm" variant="ghost" disabled={act.bulkBusy} aria-label={`${allOn ? "Mettre en pause" : "Activer"} toutes les routines ${what}`} onClick={() => void apply(list, !allOn)}>
        {act.bulkBusy && <Loader2 className="animate-spin" />} {allOn ? "Tout mettre en pause" : "Tout activer"}
      </Button>
    );
  };

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

  // The next run apart from the schedule, as a date one reads at a glance (Leslie, 30/10: « le
  // · prochaine est bizarre »).
  const next = (r: Routine) => {
    const at = r.nextRunAt ? Date.parse(r.nextRunAt) : Number.NaN;
    const text = !r.enabled ? "En pause" : !Number.isNaN(at) ? nextRunChip(at) : null;
    return text && <span className="max-w-full rounded-lg bg-soft px-2 py-0.5 text-[11.5px] font-medium text-ink-2 sm:truncate sm:rounded-full">{text}</span>;
  };

  return (
    <div className="mt-5">
      {chosen.length > 0 && (
        <div className="sticky top-2 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card px-3 py-2 text-[13px] text-ink-2 shadow-sm">
          <span className="font-semibold text-ink">
            {chosen.length} sélectionnée{chosen.length > 1 ? "s" : ""}
          </span>
          <span className="ml-auto flex flex-wrap gap-1.5">
            <Button size="sm" disabled={act.bulkBusy} onClick={() => void apply(chosen, true)}>
              {act.bulkBusy && <Loader2 className="animate-spin" />} Activer
            </Button>
            {pausable(chosen).length > 0 && (
              <Button size="sm" variant="outline" disabled={act.bulkBusy} onClick={() => void apply(chosen, false)}>
                Mettre en pause
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={act.bulkBusy} onClick={() => setPicked(new Set())}>
              Désélectionner
            </Button>
          </span>
        </div>
      )}
      {own.length > 0 && (upkeep.length > 0 || own.length > 1) && (
        <div className="mb-2 flex min-h-8 items-center justify-between gap-2">
          <p className="text-[12px] font-bold uppercase tracking-wider text-ink-3">{upkeep.length > 0 ? "Travail" : ""}</p>
          {own.length > 1 && allButton(own, "de travail")}
        </div>
      )}
      {own.length > 0 && (
        <div className={card}>
          {own.map((r) => {
            const busy = act.busyId === r.id;
            return (
              <div key={r.id} className="border-b border-line last:border-0">
                <div className="flex items-center gap-3 px-4 py-3.5">
                  {box(r)}
                  {/* On a phone the text needs the width: no icon, a name on two lines rather than cut. */}
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-tint text-brand-ink max-sm:hidden">
                    <Repeat className="size-[17px]" />
                  </span>
                  <div className="min-w-0 flex-1 leading-tight">
                    <p className="line-clamp-2 text-[14.5px] font-semibold text-ink sm:truncate">{r.name}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-3">
                      <span className="min-w-0 sm:truncate">{scheduleLabel(r.schedule)}</span>
                      {next(r)}
                    </p>
                    {/* When it last ran and where it arrives (PDF du 30/10, « Mes routines »). */}
                    <p className="mt-1 text-[12px] text-ink-3">
                      {r.lastRunAt && !Number.isNaN(Date.parse(r.lastRunAt)) ? `Dernière fois ${runDayLabel(Date.parse(r.lastRunAt))}. ` : "Jamais lancée. "}
                      {deliveryLabel(r.deliver).text}.
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
                    {box(r)}
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-soft text-ink-3 max-sm:hidden">
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

      {upkeep.length > 0 && (
        <div className={cn(card, "mt-7")}>
          {/* The fold and « Tout activer » side by side: a button cannot hold another. */}
          <div className="flex items-center gap-1 pr-3 hover:bg-soft/60">
          <button
            type="button"
            aria-expanded={upkeepOpen}
            onClick={() => setUpkeepOpen((v) => !v)}
            className="flex min-w-0 flex-1 items-center gap-3 py-3.5 pl-4 text-left"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-soft text-ink-3 max-sm:hidden">
              <Wrench className="size-[17px]" />
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-[14.5px] font-semibold text-ink">Entretien</span>
              <span className="mt-0.5 block text-[12.5px] text-ink-3">
                {upkeep.length} routine{upkeep.length > 1 ? "s" : ""} en coulisse, sans conversation
                {Number.isFinite(lastUpkeep) && <span className="max-sm:hidden"> · dernière {relativeFr(lastUpkeep)}</span>}
              </span>
            </span>
            <ChevronDown className={cn("size-4 shrink-0 text-ink-3 transition-transform", upkeepOpen && "rotate-180")} />
          </button>
          {upkeep.length > 1 && allButton(upkeep, "d'entretien")}
          </div>
          {upkeepOpen &&
            upkeep.map((r) => {
              const busy = act.busyId === r.id;
              const at = r.lastRunAt ? Date.parse(r.lastRunAt) : Number.NaN;
              return (
                <div key={r.id} className="border-t border-line bg-soft/40">
                  <div className="flex items-center gap-3 px-4 py-3">
                    {box(r)}
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-soft text-ink-3 max-sm:hidden">
                      <Wrench className="size-[17px]" />
                    </span>
                    <div className="min-w-0 flex-1 leading-tight">
                      <p className="truncate text-[14px] font-medium text-ink-2">{r.name}</p>
                      <p className="mt-0.5 truncate text-[12.5px] text-ink-3">
                        {scheduleLabel(r.schedule)}
                        {r.suggested ? "" : !r.enabled ? " · en pause" : !Number.isNaN(at) ? ` · faite ${relativeFr(at)}` : ""}
                      </p>
                    </div>
                    <span className="max-sm:hidden">{voir(r)}</span>
                    {r.suggested ? (
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => act.onToggle(r, true)}>
                        {busy && <Loader2 className="animate-spin" />} Activer
                      </Button>
                    ) : (
                      <>
                        <Switch on={r.enabled} label={`${r.enabled ? "Mettre en pause" : "Activer"} ${r.name}`} disabled={busy} onChange={() => act.onToggle(r, !r.enabled)} />
                        <RowMenu routine={r} busy={busy} {...act} />
                      </>
                    )}
                  </div>
                  {consigne(r)}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
