"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, History, Loader2, MoreHorizontal, Paperclip, Pencil, Play, Plus, Repeat, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { TOO_LARGE, tooLarge } from "@/lib/upload-limit";
import { apiFetch, readApiError } from "@/lib/api";
import { DRIVE_ROOT } from "@/lib/drive-paths";
import {
  RECURRENCES,
  ROUTINE_TIMEZONE,
  cronFor,
  cronParts,
  isOneOff,
  oneOffFor,
  recurrenceOf,
  scheduleLabel,
  todayIso,
  type Routine,
} from "@/lib/routines";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function Switch({ on, label, disabled, onChange }: { on: boolean; label: string; disabled?: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        "relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50",
        on ? "bg-primary" : "bg-soft-2"
      )}
    >
      <span
        className={cn(
          "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-[left]",
          on ? "left-6" : "left-1"
        )}
      />
    </button>
  );
}

function When({ schedule }: { schedule: string }) {
  return (
    <p className="mt-1 flex items-center gap-1.5 text-[13px] text-ink-3">
      <History className="h-3.5 w-3.5 shrink-0" />
      {scheduleLabel(schedule)}, {ROUTINE_TIMEZONE}
    </p>
  );
}

// ---- The form ----

const KEEP = "keep"; // an existing schedule the form can't show, kept as it is

interface Draft {
  name: string;
  task: string;
  recurring: boolean;
  date: string;
  time: string;
  recurrence: string; // "dom|dow", or KEEP
  skills: string[];
  attachment: string | null;
}

function draftOf(routine: Routine | null): Draft {
  const blank = { date: todayIso(1), time: "09:00", recurrence: "*|1-5" };
  if (!routine) return { name: "", task: "", recurring: true, skills: [], attachment: null, ...blank };
  const base = { name: routine.name, task: routine.task, skills: routine.skills, attachment: routine.attachment };
  if (isOneOff(routine.schedule)) {
    const d = new Date(routine.schedule);
    const time = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
    return { ...base, ...blank, recurring: false, date: routine.schedule.slice(0, 10), time };
  }
  const parts = cronParts(routine.schedule);
  return parts
    ? { ...base, ...blank, recurring: true, time: parts.time, recurrence: `${parts.dom}|${parts.dow}` }
    : { ...base, ...blank, recurring: true, recurrence: KEEP };
}

function RoutineDialog({
  open,
  onOpenChange,
  agentId,
  expert,
  routine,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: string;
  expert: RoutineExpert;
  routine: Routine | null;
  onSaved: (routine: Routine) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(routine));
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  // The routine's own schedule, when it is one the presets don't list ("Chaque lundi et jeudi").
  const parts = routine && !isOneOff(routine.schedule) ? cronParts(routine.schedule) : null;
  const recurrences = [
    ...RECURRENCES.map((r) => ({ value: `${r.dom}|${r.dow}`, label: r.label })),
    ...(parts && !RECURRENCES.some((r) => r.dom === parts.dom && r.dow === parts.dow)
      ? [{ value: `${parts.dom}|${parts.dow}`, label: recurrenceOf(parts) }]
      : []),
    ...(draft.recurrence === KEEP && routine ? [{ value: KEEP, label: `Comme aujourd’hui (${routine.schedule})` }] : []),
  ];

  async function attach(file: File) {
    if (tooLarge(file)) {
      toast.error(TOO_LARGE);
      return;
    }
    setUploading(true);
    try {
      const path = `${DRIVE_ROOT}/${expert.driveFolder}/Routines/${file.name}`;
      const res = await fetch(`/api/agents/${agentId}/files/content?path=${encodeURIComponent(path)}&overwrite=true`, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!res.ok) throw new Error(await readApiError(res, "Le fichier n’a pas pu être envoyé"));
      set({ attachment: path });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.task.trim()) {
      toast.error("Décrivez la tâche à faire.");
      return;
    }
    let schedule: string;
    if (!draft.recurring) schedule = oneOffFor(draft.date, draft.time);
    else if (draft.recurrence === KEEP) schedule = routine!.schedule;
    else {
      const [dom, dow] = draft.recurrence.split("|");
      schedule = cronFor({ dom, dow, time: draft.time });
    }
    setBusy(true);
    try {
      const body = JSON.stringify({ expert: expert.profileId, name: draft.name, task: draft.task, skills: draft.skills, attachment: draft.attachment, schedule });
      const res = routine
        ? await apiFetch<{ routine: Routine }>(`/api/agents/${agentId}/routines/${routine.id}`, { method: "PATCH", body })
        : await apiFetch<{ routine: Routine }>(`/api/agents/${agentId}/routines`, { method: "POST", body });
      onSaved(res.routine);
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const label = "text-[13px] font-semibold text-ink-2";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {expert.name}, {routine ? "modifier la routine" : "nouvelle routine"}
          </DialogTitle>
          <DialogDescription>
            {expert.name} la fait à l’heure dite, sans qu’on le demande. Le résultat arrive dans ses conversations et sur ses canaux.
          </DialogDescription>
        </DialogHeader>
        <form id="routine-form" onSubmit={save} className="grid content-start gap-3">
          <Input
            placeholder="Nom de la routine"
            aria-label="Nom de la routine"
            maxLength={80}
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
          />
          <textarea
            placeholder="Décrivez la tâche à faire"
            aria-label="Description"
            rows={5}
            value={draft.task}
            onChange={(e) => set({ task: e.target.value })}
            className="w-full resize-y rounded-xl border bg-card px-4 py-3 text-[15px] text-ink placeholder:text-ink-3 focus-visible:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/15"
          />

          <div className="flex w-fit rounded-xl bg-soft p-1" role="group" aria-label="Quand">
            {[
              { recurring: false, label: "Plus tard", icon: History },
              { recurring: true, label: "Récurrent", icon: Repeat },
            ].map((m) => (
              <button
                key={m.label}
                type="button"
                aria-pressed={draft.recurring === m.recurring}
                onClick={() => set({ recurring: m.recurring })}
                className={cn(
                  "flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[13px] font-semibold",
                  draft.recurring === m.recurring ? "bg-card text-ink shadow-sm" : "text-ink-2"
                )}
              >
                <m.icon className="h-4 w-4" /> {m.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {draft.recurring ? (
              <select
                aria-label="Fréquence"
                value={draft.recurrence}
                onChange={(e) => set({ recurrence: e.target.value })}
                className="h-11 rounded-xl border bg-card px-3 text-[15px] text-ink"
              >
                {recurrences.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                type="date"
                aria-label="Jour"
                min={todayIso()}
                value={draft.date}
                onChange={(e) => set({ date: e.target.value })}
                className="w-auto"
              />
            )}
            {!(draft.recurring && draft.recurrence === KEEP) && (
              <Input
                type="time"
                aria-label="Heure"
                step={300}
                value={draft.time}
                onChange={(e) => set({ time: e.target.value || "09:00" })}
                className="w-auto"
              />
            )}
            <span className="flex items-center gap-1.5 text-[13px] text-ink-3">
              <History className="h-3.5 w-3.5" /> {ROUTINE_TIMEZONE}, GMT
            </span>
          </div>

          {expert.skills.length > 0 && (
            <div>
              <p className={label}>Compétences</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {expert.skills.map((title) => {
                  const s = { title };
                  const on = draft.skills.includes(s.title);
                  return (
                    <button
                      key={s.title}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set({ skills: on ? draft.skills.filter((x) => x !== s.title) : [...draft.skills, s.title] })}
                      className={cn(
                        "flex items-center gap-1 rounded-full border px-3 py-1 text-[13px] font-medium",
                        on ? "border-brand/30 bg-tint text-brand-ink" : "border-border text-ink-2 hover:bg-soft"
                      )}
                    >
                      {on && <Check className="h-3.5 w-3.5" />} {s.title}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void attach(file);
                e.target.value = "";
              }}
            />
            <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? <Loader2 className="animate-spin" /> : <Paperclip />} Joindre un fichier
            </Button>
            {draft.attachment && (
              <span className="flex items-center gap-1 rounded-full bg-soft px-3 py-1 text-[13px] text-ink-2">
                {draft.attachment.split("/").pop()}
                <button type="button" aria-label="Retirer le fichier" onClick={() => set({ attachment: null })}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            )}
          </div>
        </form>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Annuler
          </Button>
          <Button type="submit" form="routine-form" disabled={busy || uploading}>
            {busy && <Loader2 className="animate-spin" />}
            {routine ? "Enregistrer" : "Créer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- The tab ----

// What the tab needs to know about the expert: its profile on the instance (where the routines
// live), and what the catalogue says of it.
export interface RoutineExpert {
  profileId: string;
  name: string;
  /** Skill names a routine may call on; empty when the catalogue does not list any. */
  skills: string[];
  /** The expert's folder in the drive, where a routine's attached file is saved. */
  driveFolder: string;
}

export function ExpertRoutines({ agentId, expert }: { agentId: string; expert: RoutineExpert }) {
  const expertKey = expert.profileId;
  const [routines, setRoutines] = useState<Routine[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ routine: Routine | null; key: number } | null>(null);
  const [removing, setRemoving] = useState<Routine | null>(null);

  const base = `/api/agents/${agentId}/routines`;

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await apiFetch<{ routines: Routine[] }>(`${base}?expert=${expertKey}`);
      setRoutines(res.routines);
    } catch {
      setLoadError(true);
    }
  }, [base, expertKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const replace = (r: Routine) => setRoutines((list) => list && (list.some((x) => x.id === r.id) ? list.map((x) => (x.id === r.id ? r : x)) : [...list, r]));

  async function toggle(r: Routine, enabled: boolean) {
    setBusyId(r.id);
    try {
      const res = await apiFetch<{ routine: Routine }>(`${base}/${r.id}`, {
        method: "PATCH",
        body: JSON.stringify({ expert: expertKey, enabled }),
      });
      replace(res.routine);
      toast.success(`${enabled ? "Routine activée" : "Routine en pause"} : ${r.name}.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function runNow(r: Routine) {
    setBusyId(r.id);
    try {
      await apiFetch(`${base}/${r.id}/run`, { method: "POST", body: JSON.stringify({ expert: expertKey }) });
      toast.success(`${expert.name} lance « ${r.name} » dans la minute. Le résultat arrive dans ses conversations et sur ses canaux.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function remove() {
    if (!removing) return;
    const r = removing;
    await apiFetch(`${base}/${r.id}?expert=${expertKey}`, { method: "DELETE" });
    setRoutines((list) => list && list.filter((x) => x.id !== r.id));
    toast.success("Routine supprimée.");
  }

  const active = routines?.filter((r) => !r.suggested) ?? [];
  const suggested = routines?.filter((r) => r.suggested) ?? [];
  const panel = "mt-5 rounded-[22px] border bg-card p-4 sm:p-5";

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-[26px] font-bold tracking-tight text-ink">Routines de {expert.name}</h1>
          <p className="mt-1 max-w-xl text-sm text-ink-3">
            Ce que {expert.name} fait sans qu’on le demande. Le résultat arrive dans tous ses canaux.
          </p>
        </div>
        <Button onClick={() => setEditing({ routine: null, key: Date.now() })} className="self-start">
          <Plus /> Nouvelle routine
        </Button>
      </div>

      {!routines ? (
        <div className={cn(panel, "flex flex-col items-center gap-3 py-12 text-center text-sm text-ink-3")}>
          {loadError ? (
            <>
              <p className="text-ink-2">Impossible de charger les routines.</p>
              <Button variant="outline" size="sm" onClick={() => void load()}>
                Réessayer
              </Button>
            </>
          ) : (
            <p className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Chargement des routines…
            </p>
          )}
        </div>
      ) : (
        <>
          <section className={panel}>
            <h2 className="text-base font-semibold text-ink">Routines actives</h2>
            {active.length === 0 ? (
              <p className="mt-2 text-sm text-ink-3">
                Aucune routine pour l’instant. Activez une proposition de {expert.name} ou créez la vôtre.
              </p>
            ) : (
              <ul className="mt-1 divide-y divide-line">
                {active.map((r) => (
                  <li key={r.id} className="flex items-start gap-3.5 py-3.5">
                    <Switch
                      on={r.enabled}
                      label={`${r.enabled ? "Mettre en pause" : "Activer"} ${r.name}`}
                      disabled={busyId === r.id}
                      onChange={() => void toggle(r, !r.enabled)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-ink">{r.name}</p>
                      <p className="text-sm text-ink-2">{r.summary}</p>
                      <When schedule={r.schedule} />
                    </div>
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label={`Actions pour ${r.name}`} disabled={busyId === r.id}>
                          {busyId === r.id ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        {r.enabled && !isOneOff(r.schedule) && (
                          <DropdownMenuItem onSelect={() => void runNow(r)}>
                            <Play /> Lancer maintenant
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onSelect={() => setEditing({ routine: r, key: Date.now() })}>
                          <Pencil /> Modifier
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(r)}>
                          <Trash2 /> Supprimer
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {suggested.length > 0 && (
            <section className={panel}>
              <h2 className="text-base font-semibold text-ink">Proposées par {expert.name}</h2>
              <p className="mt-1 text-sm text-ink-3">Activez-les en un clic, vous les modifiez ensuite.</p>
              <ul className="mt-1 divide-y divide-line">
                {suggested.map((r) => (
                  <li key={r.id} className="flex items-start gap-3.5 py-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-ink">{r.name}</p>
                      <p className="text-sm text-ink-2">{r.summary}</p>
                      <When schedule={r.schedule} />
                    </div>
                    <Button size="sm" className="shrink-0" disabled={busyId === r.id} onClick={() => void toggle(r, true)}>
                      {busyId === r.id && <Loader2 className="animate-spin" />} Activer
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {editing && (
        <RoutineDialog
          key={editing.key}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          agentId={agentId}
          expert={expert}
          routine={editing.routine}
          onSaved={(r) => {
            replace(r);
            toast.success(editing.routine ? "Routine enregistrée." : `Routine créée : ${r.name}.`);
          }}
        />
      )}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={removing ? `Supprimer « ${removing.name} » ?` : ""}
        description={`${expert.name} ne fera plus cette tâche. Ses résultats passés restent dans ses conversations.`}
        confirmText="Supprimer"
        destructive
        onConfirm={remove}
      />
    </div>
  );
}
