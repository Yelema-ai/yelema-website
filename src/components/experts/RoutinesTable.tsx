"use client";

import { Fragment, useState } from "react";
import { ChevronDown, History, Loader2, MoreHorizontal, Paperclip, Pencil, Play, Trash2 } from "lucide-react";
import { absoluteFr, relativeFr } from "@/lib/fr-dates";
import { ROUTINE_TIMEZONE, isOneOff, scheduleLabel, type Routine } from "@/lib/routines";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Rows shown before « Voir plus ».
const FIRST = 5;

export function Switch({ on, label, disabled, onChange }: { on: boolean; label: string; disabled?: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={cn("relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:opacity-50", on ? "bg-primary" : "bg-soft-2")}
    >
      <span className={cn("absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-[left]", on ? "left-5" : "left-1")} />
    </button>
  );
}

function Check({ on, label, onChange }: { on: boolean; label: string; onChange: () => void }) {
  return <input type="checkbox" checked={on} onChange={onChange} aria-label={label} className="size-4 cursor-pointer accent-primary" />;
}

function When({ iso, empty }: { iso: string | null; empty: string }) {
  const at = iso ? Date.parse(iso) : Number.NaN;
  if (Number.isNaN(at)) return <span className="text-ink-3">{empty}</span>;
  return (
    <span className="flex flex-col">
      <span className="text-ink">{relativeFr(at)}</span>
      <span className="text-xs text-ink-3">{absoluteFr(at)}</span>
    </span>
  );
}

export interface RoutineActions {
  busyId: string | null;
  onToggle: (r: Routine, enabled: boolean) => void;
  onRunNow: (r: Routine) => void;
  onHistory: (r: Routine) => void;
  onEdit: (r: Routine) => void;
  onRemove: (r: Routine) => void;
  /** Turn the chosen routines on or off; true when the whole selection went through. */
  onBulk: (routines: Routine[], enabled: boolean) => Promise<boolean>;
  bulkBusy: boolean;
}

// All of an expert's routines in one table: its own first (active or paused, with a switch and a
// menu), then the ones it proposes (shipped with it, never turned on: a « Proposée » label and a
// single « Activer »). The first five rows, then « Voir plus » for the rest.
export function RoutinesTable({ routines, ...act }: { routines: Routine[] } & RoutineActions) {
  const [all, setAll] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Routines whose full instructions are open under their row.
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggleOpen = (id: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const columns = 7;
  const shown = { items: all ? routines : routines.slice(0, FIRST) };
  const more = routines.length - FIRST;
  const th = "px-3 py-2 text-left text-xs font-semibold text-ink-3";
  // Ids of routines that left this list (activated, deleted) are simply ignored.
  const chosen = routines.filter((r) => selected.has(r.id));
  const pageAll = shown.items.length > 0 && shown.items.every((r) => selected.has(r.id));
  const setMany = (list: Routine[], on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      for (const r of list) {
        if (on) next.add(r.id);
        else next.delete(r.id);
      }
      return next;
    });
  async function bulk(enabled: boolean) {
    if (await act.onBulk(chosen, enabled)) setSelected(new Set());
  }

  return (
    <>
      {chosen.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-soft px-3 py-2 text-[13px] text-ink-2">
          <span className="font-semibold text-ink">
            {chosen.length} sélectionnée{chosen.length > 1 ? "s" : ""}
          </span>
          {pageAll && chosen.length < routines.length && (
            <button type="button" className="text-brand-ink hover:underline" onClick={() => setMany(routines, true)}>
              Sélectionner les {routines.length} routines
            </button>
          )}
          <span className="ml-auto flex flex-wrap gap-1.5">
            <Button size="sm" disabled={act.bulkBusy} onClick={() => void bulk(true)}>
              {act.bulkBusy && <Loader2 className="animate-spin" />} Activer
            </Button>
            {chosen.some((r) => !r.suggested) && (
              <Button size="sm" variant="outline" disabled={act.bulkBusy} onClick={() => void bulk(false)}>
                Mettre en pause
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={act.bulkBusy} onClick={() => setSelected(new Set())}>
              Désélectionner
            </Button>
          </span>
        </div>
      )}
      <div className="relative mt-3 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-line">
            <tr>
              <th className={cn(th, "w-10")}>
                <Check label="Sélectionner les routines de la page" on={pageAll} onChange={() => setMany(shown.items, !pageAll)} />
              </th>
              <th className={th}>Nom</th>
              <th className={th}>Horaire</th>
              <th className={th}>État</th>
              <th className={th}>Dernière exécution</th>
              <th className={th}>Prochaine exécution</th>
              <th className={cn(th, "w-12")}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="[&>tr+tr:not(.border-t-0)]:border-t [&>tr]:border-line">
            {shown.items.map((r) => {
              const busy = act.busyId === r.id;
              const suggested = r.suggested;
              return (
                <Fragment key={r.id}>
                <tr className={cn("align-top", open.has(r.id) && "[&>td]:pb-1")}>
                  <td className="px-3 py-3.5">
                    <Check label={`Sélectionner ${r.name}`} on={selected.has(r.id)} onChange={() => setMany([r], !selected.has(r.id))} />
                  </td>
                  <td className="max-w-[24rem] px-3 py-3">
                    <p className="font-semibold text-ink">{r.name}</p>
                    {!open.has(r.id) && <p className="line-clamp-2 text-[13px] text-ink-2">{r.task || r.summary}</p>}
                    <button
                      type="button"
                      aria-expanded={open.has(r.id)}
                      onClick={() => toggleOpen(r.id)}
                      className="mt-1 inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand-ink hover:underline"
                    >
                      <ChevronDown className={cn("size-3.5 transition-transform", open.has(r.id) && "rotate-180")} />
                      {open.has(r.id) ? "Masquer la consigne" : "Voir la consigne"}
                    </button>
                  </td>
                  <td className="px-3 py-3 text-ink-2">
                    {scheduleLabel(r.schedule)}
                    <span className="block text-xs text-ink-3">{ROUTINE_TIMEZONE}</span>
                  </td>
                  <td className="px-3 py-3">
                    {suggested ? (
                      <span className="inline-flex rounded-full bg-tint px-2.5 py-1 text-xs font-semibold text-brand-ink">Proposée</span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Switch on={r.enabled} label={`${r.enabled ? "Mettre en pause" : "Activer"} ${r.name}`} disabled={busy} onChange={() => act.onToggle(r, !r.enabled)} />
                        <span className={r.enabled ? "text-ink" : "text-ink-3"}>{r.enabled ? "Active" : "En pause"}</span>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">{suggested ? <span className="text-ink-3">—</span> : <When iso={r.lastRunAt} empty="Jamais" />}</td>
                  <td className="px-3 py-3">{suggested ? <span className="text-ink-3">—</span> : <When iso={r.nextRunAt} empty="—" />}</td>
                  <td className="px-3 py-2.5 text-right">
                    {suggested ? (
                      <Button size="sm" disabled={busy} onClick={() => act.onToggle(r, true)}>
                        {busy && <Loader2 className="animate-spin" />} Activer
                      </Button>
                    ) : (
                      <RowMenu routine={r} busy={busy} {...act} />
                    )}
                  </td>
                </tr>
                {open.has(r.id) && (
                  <tr className="border-t-0">
                    <td />
                    <td colSpan={columns - 1} className="px-3 pb-4">
                      <div className="rounded-xl bg-soft px-4 py-3 text-[13.5px] leading-relaxed text-ink">
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
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {more > 0 && (
        <div className="mt-2 flex justify-center border-t border-line pt-3">
          <Button variant="ghost" size="sm" aria-expanded={all} onClick={() => setAll((v) => !v)}>
            <ChevronDown className={cn("transition-transform", all && "rotate-180")} />
            {all ? "Voir moins" : `Voir plus (${more})`}
          </Button>
        </div>
      )}
    </>
  );
}

export function RowMenu({ routine: r, busy, onRunNow, onHistory, onEdit, onRemove }: { routine: Routine; busy: boolean } & RoutineActions) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={`Actions pour ${r.name}`} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {r.enabled && !isOneOff(r.schedule) && (
          <DropdownMenuItem onSelect={() => onRunNow(r)}>
            <Play /> Lancer maintenant
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => onHistory(r)}>
          <History /> Historique
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onEdit(r)}>
          <Pencil /> Modifier
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => onRemove(r)}>
          <Trash2 /> Supprimer
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
