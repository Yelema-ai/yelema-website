"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MonitorX, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { DEFAULT_GUEST_DAYS, devicesLabel, GUEST_DAYS, GUEST_STATUS_LABEL, guestFormError, parseGuestEmails, presentGuests, refusalLines, type GuestDays, type GuestRefusal, type SalonGuest } from "@/lib/salon-guests";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

// « Inviter des personnes externes » : des adresses et une durée, puis la liste des invités du salon (prolonger,
// déconnecter ses appareils, retirer). Le lien n'est jamais montré ici : chaque invité le reçoit par e-mail ; réinviter le renvoie.

const day = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

function DaysPicker({ value, onChange, label }: { value: GuestDays; onChange: (d: GuestDays) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1.5">
      {GUEST_DAYS.map((d) => (
        <button
          key={d}
          type="button"
          role="radio"
          aria-checked={value === d}
          onClick={() => onChange(d)}
          className={cn("min-h-9 rounded-full border px-3 text-[13px] font-semibold", value === d ? "border-brand bg-tint text-brand-ink" : "border-line text-ink-2 hover:bg-soft")}
        >
          {d} jours
        </button>
      ))}
    </div>
  );
}

export function SalonGuests({ salon, nom, open, onClose, onPresent }: { salon: string; nom: string; open: boolean; onClose: () => void; onPresent: (n: number) => void }) {
  const [list, setList] = useState<SalonGuest[] | null>(null);
  const [text, setText] = useState("");
  const [days, setDays] = useState<GuestDays>(DEFAULT_GUEST_DAYS);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [refused, setRefused] = useState<string[]>([]);
  const [confirming, setConfirming] = useState<string | null>(null);
  const base = `/api/buzz/salons/${salon}/guests`;

  const tell = useRef(onPresent);
  tell.current = onPresent;
  const shown = useCallback((l: SalonGuest[]) => {
    setList(l);
    tell.current(presentGuests(l).length);
  }, []);

  useEffect(() => {
    if (!open) return;
    let stop = false;
    apiFetch<{ data: SalonGuest[] }>(base, undefined, "Les invités du salon sont indisponibles").then(
      (r) => !stop && shown(r.data),
      (e: Error) => !stop && setError(e.message),
    );
    return () => {
      stop = true;
    };
  }, [open, base, shown]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const refused = guestFormError(text, days);
    if (refused) return setError(refused);
    setBusy("invite");
    setError(null);
    setRefused([]);
    try {
      const r = await apiFetch<{ data: SalonGuest[]; refused: GuestRefusal[] }>(base, { method: "POST", body: JSON.stringify({ emails: parseGuestEmails(text).emails, days }) }, "Les invitations n’ont pas pu être envoyées");
      shown(r.data);
      setText("");
      const no = refusalLines(Array.isArray(r.refused) ? r.refused : []);
      setRefused(no);
      // Only the refused addresses stay in the field, to correct them.
      setText(Array.isArray(r.refused) ? r.refused.map((x) => x.email).join(", ") : "");
      if (r.data.length > no.length || !no.length) toast.success("Invitations envoyées par e-mail.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function act(g: SalonGuest, how: "extend" | "remove" | "devices", extend: GuestDays = DEFAULT_GUEST_DAYS) {
    if (how === "remove" && !window.confirm(`Retirer l’accès de ${g.email} ? Ses clés quittent le salon tout de suite.`)) return;
    setConfirming(null);
    setBusy(g.id);
    try {
      const url = `${base}/${encodeURIComponent(g.id)}`;
      if (how === "remove") await apiFetch(url, { method: "DELETE" }, "L’accès n’a pas pu être retiré");
      else if (how === "devices") await apiFetch(`${url}/devices`, { method: "DELETE" }, "Ses appareils n’ont pas pu être déconnectés");
      else await apiFetch(url, { method: "PATCH", body: JSON.stringify({ days: extend }) }, "L’accès n’a pas pu être prolongé");
      shown((await apiFetch<{ data: SalonGuest[] }>(base)).data);
      toast.success(how === "remove" ? "Accès retiré." : how === "devices" ? "Appareils déconnectés. Un nouveau code lui permettra de revenir." : `Accès prolongé de ${extend} jours.`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader className="text-left">
          <DialogTitle className="font-display text-xl font-bold text-ink">Inviter des personnes externes</DialogTitle>
          <DialogDescription>
            Elles lisent et écrivent dans « {nom} » et voient ses livrables, rien d’autre. Chacune reçoit un lien personnel par e-mail.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={invite} className="flex flex-col gap-3" noValidate>
          <Label htmlFor="guest-emails">Adresses e-mail</Label>
          <textarea
            id="guest-emails"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="jean.paul@exemple.com, mims@exemple.org"
            className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-[15px] text-ink placeholder:text-ink-3 focus-visible:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/15"
          />
          <span className="text-[13px] font-semibold text-ink-2">Durée de l’accès</span>
          <DaysPicker value={days} onChange={setDays} label="Durée de l’accès" />
          {error && <p role="alert" className="rounded-xl bg-ko-pale px-4 py-3 text-sm text-ko">{error}</p>}
          {refused.length > 0 && (
            <div role="alert" className="rounded-xl bg-ko-pale px-4 py-3 text-sm text-ko">
              <p className="font-semibold">Non invitées :</p>
              <ul className="mt-1 list-disc pl-5">
                {refused.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
          )}
          <Button type="submit" disabled={busy !== null} className="self-end">
            {busy === "invite" && <Loader2 className="animate-spin" />} Inviter
          </Button>
        </form>
        <section aria-label="Invités du salon">
          <h3 className="text-[13px] font-semibold text-ink-2">Invités du salon</h3>
          {list === null && !error && <Loader2 className="mt-2 size-4 animate-spin text-ink-3" aria-label="Chargement" />}
          {list?.length === 0 && <p className="mt-2 text-sm text-ink-3">Aucune personne externe pour l’instant.</p>}
          {list && list.length > 0 && (
            <ul className="mt-2 overflow-hidden rounded-card border border-line">
              {list.map((g) => {
                const live = g.status === "invited" || g.status === "active";
                const devices = devicesLabel(g.devices);
                return (
                  <li key={g.id} className="flex flex-wrap items-center gap-2 border-b border-line px-3.5 py-2.5 last:border-0">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{g.email}</span>
                      <span className="block text-xs text-ink-3">
                        {GUEST_STATUS_LABEL[g.status]}
                        {live && ` · jusqu’au ${day(g.expiresAt)}`}
                        {devices && ` · ${devices}`}
                        {g.invitedBy?.nom && ` · invité par ${g.invitedBy.nom}`}
                      </span>
                    </span>
                    {busy === g.id ? (
                      <Loader2 className="size-4 animate-spin text-ink-3" />
                    ) : confirming === g.id ? (
                      <span className="flex w-full items-center justify-end gap-2 text-[13px] text-ink-2">
                        Déconnecter ses {devices} ?
                        <Button type="button" size="sm" variant="destructive" onClick={() => void act(g, "devices")}>Déconnecter</Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(null)}>Annuler</Button>
                      </span>
                    ) : (
                      <>
                        <select
                          aria-label={`Prolonger l’accès de ${g.email}`}
                          value=""
                          onChange={(e) => e.target.value && void act(g, "extend", Number(e.target.value) as GuestDays)}
                          className="h-9 rounded-lg border border-line bg-surface px-2 text-[13px] text-ink-2"
                        >
                          <option value="">Prolonger…</option>
                          {GUEST_DAYS.map((d) => (
                            <option key={d} value={d}>{d} jours</option>
                          ))}
                        </select>
                        {devices && (
                          <button type="button" onClick={() => setConfirming(g.id)} aria-label={`Déconnecter ses appareils (${g.email})`} title="Déconnecter ses appareils" className="grid size-9 place-items-center rounded-lg text-ink-3 hover:bg-soft hover:text-ko">
                            <MonitorX className="size-4" />
                          </button>
                        )}
                        {g.status !== "revoked" && (
                          <button type="button" onClick={() => void act(g, "remove")} aria-label={`Retirer l’accès de ${g.email}`} title="Retirer l’accès" className="grid size-9 place-items-center rounded-lg text-ink-3 hover:bg-soft hover:text-ko">
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
