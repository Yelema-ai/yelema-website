"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Check, Hash, Loader2, Search } from "lucide-react";
import { fold } from "@/lib/fold";
import { MAX_RECIPIENTS, peopleOf, shortName, type BuzzEntry, type DirectoryPerson } from "@/lib/buzz";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ParticipantAvatar } from "@/components/messaging/ParticipantAvatar";

// « Nouveau message » et « Nouveau salon » : d'abord les membres, puis, pour chacun, la personne
// et/ou ses Experts. Une conversation directe tient à 9 ; un salon est nommé et peut être plus grand.

export type ExchangeKind = "message" | "salon" | "ajout";

const COPY: Record<ExchangeKind, { title: string; first: string; go: string }> = {
  message: { title: "Message direct", first: "À qui écrivez-vous ?", go: "Écrire" },
  salon: { title: "Nouveau salon", first: "Nommez le salon, puis choisissez qui y entre.", go: "Créer le salon" },
  ajout: { title: "Ajouter au salon", first: "Qui ajoutez-vous ? Ils seront prévenus.", go: "Ajouter" },
};
const SALON_MAX_KEYS = 50;

const entryKeys = (e: BuzzEntry | null): string[] => e?.cles ?? [];

export function NewExchange({ kind, onClose, directory, mine, onStart, onSalon }: { kind: ExchangeKind | null; onClose: () => void; directory: BuzzEntry[]; mine: string[]; onStart: (kind: ExchangeKind, keys: string[], name: string) => Promise<void>; /** Au-delà de 9 : le même choix part en salon, à nommer. */ onSalon?: () => void }) {
  // Vos propres Experts en dernier, sous « Vos Experts » : on écrit d'abord aux autres.
  const people = useMemo(() => {
    const all = peopleOf(directory, mine);
    return [...all.filter((p) => !p.self), ...all.filter((p) => p.self)];
  }, [directory, mine]);
  const [query, setQuery] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [entries, setEntries] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [refusal, setRefusal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const copy = COPY[kind ?? "message"];

  const picked = people.filter((p) => members.includes(p.membre));
  const chosen = picked.flatMap((p) => [p.person, ...p.experts]).filter((e): e is BuzzEntry => e !== null && entries.has(entryId(e)));
  // An expert written to brings its owner along: they see what their expert receives.
  const owners = picked.filter((p) => p.person && p.experts.some((e) => entries.has(entryId(e)))).map((p) => p.person as BuzzEntry);
  const keys = [...new Set([...chosen, ...owners].flatMap(entryKeys))];
  const tooMany = kind === "message" ? keys.length + mine.length > MAX_RECIPIENTS + 1 : keys.length > SALON_MAX_KEYS;

  function reset() {
    setMembers([]);
    setEntries(new Set());
    setStep(1);
    setName("");
    setQuery("");
    setRefusal(null);
  }

  function next() {
    // By default: the person themself when reachable, otherwise all their experts.
    setEntries(new Set(picked.flatMap((p) => (p.person ? [entryId(p.person)] : p.experts.map(entryId)))));
    setStep(2);
  }

  async function go() {
    setRefusal(null);
    setBusy(true);
    try {
      await onStart(kind ?? "message", keys, name.trim());
      reset();
    } catch (e) {
      setRefusal(e instanceof Error ? e.message : "Conversation non ouverte.");
    } finally {
      setBusy(false);
    }
  }

  const close = () => {
    reset();
    onClose();
  };

  return (
    <Dialog open={kind !== null} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="text-left">
          <DialogTitle className="font-display text-xl font-bold text-ink">{copy.title}</DialogTitle>
          <DialogDescription>{step === 1 ? copy.first : "Choisissez le membre, ses Experts, ou les deux."}</DialogDescription>
        </DialogHeader>

        {step === 1 && kind === "salon" && (
          <div className="space-y-1.5">
            <Label htmlFor="salon-nom">Nom du salon</Label>
            <Input id="salon-nom" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Ex. Clôture mensuelle" />
          </div>
        )}

        {step === 1 && people.length > 5 && (
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Chercher une personne ou un Expert" aria-label="Chercher une personne ou un Expert" className="h-10 w-full rounded-xl border border-line bg-soft pl-9 pr-3 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-brand/40 focus:bg-surface" />
          </label>
        )}

        {step === 1 ? (
          <ul className="max-h-80 space-y-1.5 overflow-y-auto pt-1">
            {people.filter((p) => !query.trim() || members.includes(p.membre) || [p.nom, ...p.experts.map((e) => e.nom)].some((n) => fold(n).includes(fold(query.trim())))).map((p) => (
              <li key={p.membre}>
                <Choice checked={members.includes(p.membre)} onChange={(on) => setMembers((m) => (on ? [...m, p.membre] : m.filter((x) => x !== p.membre)))} icon={<ParticipantAvatar entry={p.person ?? directory.find((e) => e.type === "personne" && e.membre === p.membre) ?? null} name={p.nom} />} label={p.self ? "Vos Experts" : p.nom} hint={memberHint(p)} faces={p.experts} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="max-h-80 space-y-4 overflow-y-auto pt-1">
            {picked.map((p) => (
              <section key={p.membre}>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">{p.self ? "Vos Experts" : p.nom}</h3>
                <ul className="space-y-1.5">
                  {[p.person, ...p.experts].filter((e): e is BuzzEntry => e !== null).map((e) => (
                    <li key={entryId(e)}>
                      <Choice
                        checked={entries.has(entryId(e))}
                        onChange={(on) => setEntries((s) => { const n = new Set(s); if (on) n.add(entryId(e)); else n.delete(entryId(e)); return n; })}
                        icon={<ParticipantAvatar entry={e} name={e.nom} />}
                        label={e.type === "personne" ? e.nom : shortName(e.nom)}
                        hint={e.type === "expert" ? (e.pronom === "elle" ? "Experte" : "Expert") : "Membre de l’équipe"}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        {kind === "message" && !tooMany && (
          // La limite se lit avant le choix, sobrement ; le salon est à un clic.
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-3">
            Un message part à 9 personnes au plus, vous compris. Un salon en accueille 50.
            {onSalon && (
              <button type="button" onClick={() => { reset(); onSalon(); }} className="inline-flex items-center gap-1 font-semibold text-brand-ink hover:underline">
                <Hash className="size-3.5" />
                Créer un salon
              </button>
            )}
          </p>
        )}
        {tooMany &&
          (kind === "message" ? (
            // Un message direct tient à 9 (une limite de la messagerie) ; au-delà, le salon prend le relais, sans erreur.
            <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl bg-tint px-4 py-3 text-sm text-ink">
              <span className="min-w-0 flex-1">Plus de 9 personnes : passez par un salon, il en accueille 50.</span>
              {onSalon && (
                <Button size="sm" onClick={() => { reset(); onSalon(); }}>
                  <Hash />
                  Créer un salon
                </Button>
              )}
            </div>
          ) : (
            <p role="alert" className="rounded-xl bg-ko-pale px-4 py-3 text-sm text-ko">Trop de participants pour un salon.</p>
          ))}
        {refusal && <p role="alert" className="rounded-xl bg-ko-pale px-4 py-3 text-sm text-ko">{refusal}</p>}
        <DialogFooter>
          {step === 1 ? (
            <>
              <Button variant="outline" onClick={close}>Annuler</Button>
              <Button onClick={next} disabled={!members.length || (kind === "salon" && !name.trim())}>Continuer</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft />Retour</Button>
              <Button onClick={() => void go()} disabled={!keys.length || tooMany || busy}>
                {busy && <Loader2 className="animate-spin" />}
                {copy.go}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const entryId = (e: BuzzEntry): string => `${e.type}:${e.membre}:${e.nom}`;

function memberHint(p: DirectoryPerson): string {
  const n = p.experts.length;
  const experts = n ? `${n} Expert${n > 1 ? "s" : ""}` : "";
  return p.self ? experts : experts || (p.person ? "Membre de l’équipe" : "");
}

// Une ligne à choisir, sans case native : la ligne entière se coche, une coche ronde à droite le dit.
function Choice({ checked, onChange, icon, label, hint, faces = [] }: { checked: boolean; onChange: (on: boolean) => void; icon: React.ReactNode; label: string; hint: string; /** Les visages de ses Experts, en petit à côté du nom. */ faces?: BuzzEntry[] }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn("flex min-h-12 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm transition-colors", checked ? "border-brand/40 bg-tint" : "border-line hover:bg-soft")}
    >
      <span className="grid shrink-0 place-items-center">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-ink">{label}</span>
        {hint && <span className="block truncate text-xs text-ink-3">{hint}</span>}
      </span>
      {faces.length > 0 && (
        <span className="flex shrink-0 -space-x-2" aria-hidden>
          {faces.slice(0, 3).map((e) => <ParticipantAvatar key={e.nom} entry={e} name={e.nom} size="xxs" className="rounded-full ring-2 ring-surface" />)}
        </span>
      )}
      <span className={cn("grid size-5 shrink-0 place-items-center rounded-full border transition-colors", checked ? "border-brand bg-brand text-on-brand" : "border-ink-3/40 bg-surface")} aria-hidden>
        {checked && <Check className="size-3.5" strokeWidth={3} />}
      </span>
    </button>
  );
}
