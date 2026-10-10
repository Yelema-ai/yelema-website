"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { orderUnits, type OrgChart, type OrgGrant, type OrgUnit } from "@/lib/memory";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// The org chart of the company: units in a tree, where each member sits, and the exceptions. It
// decides what each member's experts read in the company memory. The back office keeps it and
// applies it; every change here is one call, then the chart is read again.

const NONE = "";
const FIELD = "rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink";
const CARD = "mt-5 rounded-[22px] border border-line bg-surface p-5 sm:p-6";

export function OrgChartView() {
  const [chart, setChart] = useState<OrgChart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [parent, setParent] = useState(NONE);
  const [removing, setRemoving] = useState<OrgUnit | null>(null);
  const [grantee, setGrantee] = useState(NONE);
  const [grantUnit, setGrantUnit] = useState(NONE);
  const [right, setRight] = useState<OrgGrant["right"]>("read");

  const load = useCallback(
    () =>
      apiFetch<OrgChart>("/api/org")
        .then(setChart)
        .catch((e: Error) => setError(e.message)),
    []
  );
  useEffect(() => void load(), [load]);

  // One change, then the chart as the back office now holds it. A refusal is shown as it is said.
  async function change(url: string, method: string, body?: unknown): Promise<boolean> {
    try {
      await apiFetch(url, { method, body: body === undefined ? undefined : JSON.stringify(body) });
      await load();
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    }
  }

  const units = chart ? orderUnits(chart.units) : [];
  const unitName = (id: string | null) => chart?.units.find((u) => u.id === id)?.name ?? "—";
  const memberName = (id: string | null) => {
    const m = chart?.members.find((x) => x.id === id);
    return m?.name?.trim() || m?.email || "—";
  };

  return (
    <div className="max-w-4xl">
      <h1 className="font-display text-[28px] font-bold tracking-tight text-ink">Organigramme</h1>
      <p className="mt-1 max-w-2xl text-sm text-ink-2">
        Chaque unité a son compartiment dans la mémoire de l’entreprise. Un membre lit celui de son unité ; un responsable lit aussi ceux des unités du dessous et dépose dans le sien. Ce qui est déposé pour toute l’entreprise est lu par tous.
      </p>

      {error && <p className="mt-4 max-w-xl rounded-xl bg-ko-pale px-4 py-3 text-sm text-ko">{error}</p>}
      {!chart && !error && <Loader2 className="mt-6 h-5 w-5 animate-spin text-ink-3" aria-label="Chargement" />}

      {chart && (
        <>
          <section className={CARD}>
            <h2 className="text-lg font-bold text-ink">Unités</h2>
            {units.length === 0 && <p className="mt-2 text-sm text-ink-3">Aucune unité : toute la mémoire est lisible par tous les membres.</p>}
            <ul className="mt-3 divide-y divide-line">
              {units.map(({ unit, depth }) => (
                <li key={unit.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="text-sm font-semibold text-ink" style={{ paddingLeft: `${depth * 20}px` }}>
                    {depth > 0 ? "└ " : ""}
                    {unit.name}
                  </span>
                  <span className="flex items-center gap-2">
                    <select
                      aria-label={`Rattacher ${unit.name} à`}
                      className={FIELD}
                      value={unit.parent ?? NONE}
                      onChange={(e) => void change(`/api/org/units/${unit.id}`, "PATCH", { parent: e.target.value || null })}
                    >
                      <option value={NONE}>Au sommet</option>
                      {chart.units
                        .filter((u) => u.id !== unit.id)
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            Sous {u.name}
                          </option>
                        ))}
                    </select>
                    <Button variant="ghost" size="sm" className="text-ko" onClick={() => setRemoving(unit)}>
                      Supprimer
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <label className="text-[13px] font-semibold text-ink-3">
                Nouvelle unité
                <Input className="mt-1 w-56" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
              </label>
              <select aria-label="Rattachée à" className={FIELD} value={parent} onChange={(e) => setParent(e.target.value)}>
                <option value={NONE}>Au sommet</option>
                {chart.units.map((u) => (
                  <option key={u.id} value={u.id}>
                    Sous {u.name}
                  </option>
                ))}
              </select>
              <Button
                disabled={!name.trim()}
                onClick={async () => {
                  if (await change("/api/org/units", "POST", { name, parent: parent || null })) setName("");
                }}
              >
                Ajouter l’unité
              </Button>
            </div>
          </section>

          <section className={CARD}>
            <h2 className="text-lg font-bold text-ink">Place des membres</h2>
            {chart.members.length === 0 && <p className="mt-2 text-sm text-ink-3">Aucun membre.</p>}
            <ul className="mt-3 divide-y divide-line">
              {chart.members.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0 text-sm">
                    <span className="block font-semibold text-ink">{m.name?.trim() || m.email}</span>
                    {m.name?.trim() && <span className="block text-xs text-ink-3">{m.email}</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    <select aria-label="Unité" className={FIELD} value={m.unit ?? NONE} onChange={(e) => void change(`/api/org/members/${m.id}`, "PATCH", { unit: e.target.value || null })}>
                      <option value={NONE}>Sans unité</option>
                      {chart.units.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                    <select aria-label="Place" className={FIELD} value={m.unitRole} disabled={!m.unit} onChange={(e) => void change(`/api/org/members/${m.id}`, "PATCH", { unitRole: e.target.value })}>
                      <option value="member">Membre</option>
                      <option value="head">Responsable</option>
                    </select>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className={CARD}>
            <h2 className="text-lg font-bold text-ink">Exceptions</h2>
            <p className="mt-1 text-sm text-ink-3">Ouvre le compartiment d’une unité à une personne ou à une autre unité, en plus de la règle.</p>
            <ul className="mt-3 divide-y divide-line">
              {chart.grants.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm text-ink">
                  <span>
                    <strong>{g.user ? memberName(g.user) : `Unité ${unitName(g.granteeUnit)}`}</strong> {g.right === "write" ? "lit et dépose dans" : "lit"} <strong>{unitName(g.unit)}</strong>
                  </span>
                  <Button variant="ghost" size="sm" className="text-ko" onClick={() => void change(`/api/org/grants/${g.id}`, "DELETE")}>
                    Retirer
                  </Button>
                </li>
              ))}
            </ul>
            {chart.units.length > 0 && (
              <div className="mt-4 flex flex-wrap items-end gap-2">
                <select aria-label="Bénéficiaire" className={FIELD} value={grantee} onChange={(e) => setGrantee(e.target.value)}>
                  <option value={NONE}>Qui…</option>
                  {chart.members.map((m) => (
                    <option key={m.id} value={`user:${m.id}`}>
                      {m.name?.trim() || m.email}
                    </option>
                  ))}
                  {chart.units.map((u) => (
                    <option key={u.id} value={`unit:${u.id}`}>
                      Unité {u.name}
                    </option>
                  ))}
                </select>
                <select aria-label="Droit" className={FIELD} value={right} onChange={(e) => setRight(e.target.value as OrgGrant["right"])}>
                  <option value="read">lit</option>
                  <option value="write">lit et dépose dans</option>
                </select>
                <select aria-label="Unité ouverte" className={FIELD} value={grantUnit} onChange={(e) => setGrantUnit(e.target.value)}>
                  <option value={NONE}>Quelle unité…</option>
                  {chart.units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  disabled={!grantee || !grantUnit}
                  onClick={async () => {
                    const [kind, id] = grantee.split(":");
                    const who = kind === "user" ? { user: id } : { granteeUnit: id };
                    if (await change("/api/org/grants", "POST", { ...who, unit: grantUnit, right })) setGrantee(NONE);
                  }}
                >
                  Ajouter l’exception
                </Button>
              </div>
            )}
          </section>
        </>
      )}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Supprimer l’unité « ${removing?.name ?? ""} » ?`}
        description="Les unités du dessous remontent d’un cran. Une unité qui a encore des membres ou des dépôts réservés ne peut pas être supprimée."
        confirmText="Supprimer"
        destructive
        onConfirm={async () => {
          if (!removing) return;
          await apiFetch(`/api/org/units/${removing.id}`, { method: "DELETE" });
          await load();
        }}
      />
    </div>
  );
}
