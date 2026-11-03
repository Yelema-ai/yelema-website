"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Loader2, MessagesSquare, User, Users } from "lucide-react";
import { MAX_RECIPIENTS, peopleOf, type BuzzEntry, type DirectoryPerson } from "@/lib/buzz";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// « Nouveau message » et « Nouveau salon » : d'abord les membres, puis, pour chacun, la personne
// et/ou ses Experts. Une conversation directe tient à 9 ; un salon est nommé et peut être plus grand.

export type ExchangeKind = "message" | "salon";

const COPY: Record<ExchangeKind, { title: string; first: string; go: string }> = {
  message: { title: "Nouveau message", first: "Choisissez les membres à qui écrire.", go: "Ouvrir la conversation" },
  salon: { title: "Nouveau salon", first: "Nommez le salon et choisissez ses membres.", go: "Créer le salon" },
};
const SALON_MAX_KEYS = 50;

const entryKeys = (e: BuzzEntry | null): string[] => e?.cles ?? [];

export function NewExchange({ kind, onClose, directory, mine, onStart }: { kind: ExchangeKind | null; onClose: () => void; directory: BuzzEntry[]; mine: string[]; onStart: (kind: ExchangeKind, keys: string[], name: string) => Promise<void> }) {
  const people = useMemo(() => peopleOf(directory, mine), [directory, mine]);
  const [members, setMembers] = useState<string[]>([]);
  const [entries, setEntries] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [refusal, setRefusal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const copy = COPY[kind ?? "message"];

  const picked = people.filter((p) => members.includes(p.membre));
  const chosen = picked.flatMap((p) => [p.person, ...p.experts]).filter((e): e is BuzzEntry => e !== null && entries.has(entryId(e)));
  const keys = [...new Set(chosen.flatMap(entryKeys))];
  const tooMany = kind === "salon" ? keys.length > SALON_MAX_KEYS : keys.length + mine.length > MAX_RECIPIENTS + 1;

  function reset() {
    setMembers([]);
    setEntries(new Set());
    setStep(1);
    setName("");
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
      setRefusal(e instanceof Error ? e.message : "Échange non ouvert.");
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
          <DialogDescription>
            {step === 1 ? copy.first : "Pour chaque membre : la personne, un ou plusieurs de ses Experts."}
            {kind === "message" && " 9 participants au plus, vous compris."}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && kind === "salon" && (
          <div className="space-y-1.5">
            <Label htmlFor="salon-nom">Nom du salon</Label>
            <Input id="salon-nom" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Ex. Clôture mensuelle" />
          </div>
        )}

        {step === 1 ? (
          <ul className="max-h-80 space-y-1.5 overflow-y-auto pt-1">
            {people.map((p) => (
              <li key={p.membre}>
                <Choice checked={members.includes(p.membre)} onChange={(on) => setMembers((m) => (on ? [...m, p.membre] : m.filter((x) => x !== p.membre)))} icon={<Users className="h-3.5 w-3.5" />} label={p.self ? "Vous" : p.nom} hint={memberHint(p)} />
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
                        icon={e.type === "expert" ? <MessagesSquare className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
                        label={e.type === "personne" ? `${e.nom} (la personne)` : e.nom}
                        hint={e.type === "expert" ? "Expert" : "Personne"}
                        brand={e.type === "expert"}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        {tooMany && <p role="alert" className="rounded-xl bg-ko-pale px-4 py-3 text-sm text-ko">{kind === "salon" ? "Trop de participants pour un salon." : "Trop de participants : 9 au plus, vous compris. Retirez quelqu’un, ou créez un salon."}</p>}
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
  return p.self ? experts : [p.person ? "Personne" : "", experts].filter(Boolean).join(" · ");
}

function Choice({ checked, onChange, icon, label, hint, brand = false }: { checked: boolean; onChange: (on: boolean) => void; icon: React.ReactNode; label: string; hint: string; brand?: boolean }) {
  return (
    <label className={cn("flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors", checked ? "border-brand/40 bg-tint" : "border-line hover:bg-soft")}>
      <input type="checkbox" className="accent-brand" checked={checked} onChange={(ev) => onChange(ev.target.checked)} />
      <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-lg", brand ? "bg-tint text-brand" : "bg-soft-2 text-ink-2")}>{icon}</span>
      <span className="min-w-0 flex-1 truncate font-semibold text-ink">{label}</span>
      <span className="text-xs text-ink-3">{hint}</span>
    </label>
  );
}
