"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, ChevronDown, Loader2, Mail, MessageCircle, Webhook } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { runPool } from "@/lib/bulk";
import { relativeFr } from "@/lib/fr-dates";
import { paginate } from "@/lib/paginate";
import { SOURCE_LABELS, accountNameOf, hasKey, revealsKey, type Trigger, type TriggerSource, type TriggersOverview, type TriggerWithKey } from "@/lib/triggers";
import type { IntegrationConnection, IntegrationConnectionsResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Pager } from "@/components/Pager";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TriggerDialog } from "./TriggerDialog";
import { TriggerKeyDialog } from "./TriggerKeyDialog";

const PER_PAGE = 10;
const ICONS: Record<TriggerSource, typeof Mail> = { agentmail: Mail, gmail: Mail, outlook: Mail, calendar: CalendarClock, unipile: MessageCircle, webhook: Webhook };

function conditions(t: Trigger): string {
  const f = t.filter;
  const parts = [
    t.source === "calendar" && f.leadMinutes ? `${f.leadMinutes} min avant` : null,
    f.senders.length || f.domains.length ? `de ${[...f.senders, ...f.domains].join(", ")}` : null,
    f.keywords.length ? `mots : ${f.keywords.join(", ")}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Sans condition";
}

// Les déclencheurs de l'expert : cocher, puis un seul bouton « Action (N) ». `createKey` change : formulaire de création.
export function ExpertTriggers({ agentId, expert, createKey }: { agentId: string; expert: { profileId: string; name: string }; createKey: number | null }) {
  const [overview, setOverview] = useState<TriggersOverview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ trigger: Trigger | null; key: number } | null>(null);
  const [revealed, setRevealed] = useState<(TriggerWithKey & { key: string }) | null>(null);
  const [removing, setRemoving] = useState<Trigger[] | null>(null);
  const [conns, setConns] = useState<IntegrationConnection[]>([]);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setOverview(await apiFetch<TriggersOverview>("/api/triggers"));
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (createKey) setEditing({ trigger: null, key: createKey });
  }, [createKey]);

  const mine = overview?.triggers.filter((t) => t.expert === expert.profileId) ?? [];
  // Le nom du compte écouté vient des Connecteurs ; illisibles, la ligne s'en passe.
  const needsAccounts = mine.some((t) => t.accountId);
  useEffect(() => {
    if (!needsAccounts) return;
    let live = true;
    apiFetch<IntegrationConnectionsResult>(`/api/agents/${agentId}/integrations/connections`)
      .then((r) => live && setConns(r.connections))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [agentId, needsAccounts]);
  const allowed = overview?.experts.includes(expert.profileId) ?? false;
  const shown = paginate(mine, page, PER_PAGE);
  const chosen = mine.filter((t) => selected.has(t.id));
  const allChosen = mine.length > 0 && chosen.length === mine.length;

  // The key never stays in the list: only the one-time dialog holds it.
  const replace = ({ key: _key, ...t }: TriggerWithKey) =>
    setOverview((o) => o && { ...o, triggers: o.triggers.some((x) => x.id === t.id) ? o.triggers.map((x) => (x.id === t.id ? t : x)) : [...o.triggers, t] });
  const toggleOne = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  function saved(t: TriggerWithKey) {
    replace(t);
    if (revealsKey(t)) setRevealed(t);
    toast.success(editing?.trigger ? "Déclencheur enregistré." : `Déclencheur créé : ${t.name}.`);
  }

  async function patchAll(list: Trigger[], body: Record<string, unknown>, done: string) {
    setBusy(true);
    try {
      const results = await runPool(list, 3, (t) => apiFetch<TriggerWithKey>(`/api/triggers/${t.id}`, { method: "PATCH", body: JSON.stringify(body) }));
      for (const r of results) if (r.status === "fulfilled") replace(r.value);
      const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
      if (failed) toast.error((failed.reason as Error).message);
      else toast.success(done);
      if (list.length === 1 && results[0]?.status === "fulfilled" && revealsKey(results[0].value)) setRevealed(results[0].value);
      setSelected(new Set());
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const list = removing ?? [];
    const results = await runPool(list, 3, (t) => apiFetch(`/api/triggers/${t.id}`, { method: "DELETE" }));
    const gone = new Set(list.filter((_, i) => results[i]?.status === "fulfilled").map((t) => t.id));
    setOverview((o) => o && { ...o, triggers: o.triggers.filter((t) => !gone.has(t.id)) });
    setSelected(new Set());
    const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failed) throw failed.reason;
    toast.success(gone.size > 1 ? `${gone.size} déclencheurs supprimés.` : "Déclencheur supprimé.");
  }

  const panel = "mt-5 rounded-[22px] border bg-card p-4 sm:p-5";
  if (!overview) {
    return (
      <div className={cn(panel, "flex flex-col items-center gap-3 py-12 text-center text-sm text-ink-3")}>
        {loadError ? (
          <>
            <p className="text-ink-2">{loadError}</p>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Réessayer
            </Button>
          </>
        ) : (
          <p className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement des déclencheurs…
          </p>
        )}
      </div>
    );
  }

  const one = chosen.length === 1 ? chosen[0] : null;
  return (
    <div className="mt-5">
      {!allowed ? (
        <section className={panel}>
          <p className="text-sm text-ink-3">{expert.name} ne peut pas encore réagir à un événement.</p>
        </section>
      ) : mine.length === 0 ? (
        <section className={panel}>
          <p className="text-sm text-ink-3">Aucun déclencheur. Avec « Nouvelle routine », {expert.name} peut réagir à un mail, un message ou un rendez-vous.</p>
        </section>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="size-4 cursor-pointer accent-primary" checked={allChosen} onChange={() => setSelected(allChosen ? new Set() : new Set(mine.map((t) => t.id)))} aria-label="Tout sélectionner" />
              {chosen.length ? `${chosen.length} sélectionné${chosen.length > 1 ? "s" : ""}` : "Tout sélectionner"}
            </label>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="ml-auto" disabled={!chosen.length || busy}>
                  {busy && <Loader2 className="animate-spin" />} Action ({chosen.length}) <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {one && <DropdownMenuItem onSelect={() => setEditing({ trigger: one, key: Date.now() })}>Modifier</DropdownMenuItem>}
                <DropdownMenuItem onSelect={() => void patchAll(chosen, { enabled: true }, "Déclencheurs activés.")}>Activer</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void patchAll(chosen, { enabled: false }, "Déclencheurs en pause.")}>Mettre en pause</DropdownMenuItem>
                {one && hasKey(one.source) && !one.webhookSubscribed && (
                  <DropdownMenuItem onSelect={() => void patchAll([one], { rotateKey: true }, "Nouvelle clé créée : l’ancienne ne marche plus.")}>Nouvelle clé</DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(chosen)}>
                  Supprimer
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="overflow-hidden rounded-2xl border border-line bg-card">
            {shown.items.map((t) => {
              const Icon = ICONS[t.source];
              const fired = t.lastFiredAt ? Date.parse(t.lastFiredAt) : Number.NaN;
              const account = accountNameOf(conns, t.accountId);
              return (
                <div key={t.id} className="flex items-center gap-3 border-b border-line px-4 py-3.5 last:border-0">
                  <input type="checkbox" className="size-4 shrink-0 cursor-pointer accent-primary" checked={selected.has(t.id)} onChange={() => toggleOne(t.id)} aria-label={`Sélectionner ${t.name}`} />
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-tint text-brand-ink max-sm:hidden">
                    <Icon className="size-[17px]" />
                  </span>
                  <div className="min-w-0 flex-1 leading-tight">
                    <button type="button" onClick={() => setEditing({ trigger: t, key: Date.now() })} className="line-clamp-2 text-left text-[14.5px] font-semibold text-ink hover:underline sm:truncate">
                      {t.name}
                    </button>
                    <p className="mt-1 text-[12.5px] text-ink-3">
                      {SOURCE_LABELS[t.source]}
                      {account && ` · ${account}`} · {conditions(t)}
                    </p>
                    {t.source === "unipile" && t.webhookSubscribed && <p className="mt-1 text-[12px] font-semibold text-brand-ink">Abonnement Unipile actif</p>}
                    <p className="mt-1 text-[12px] text-ink-3">{Number.isNaN(fired) ? "Jamais déclenché." : `Dernière fois ${relativeFr(fired)}.`}</p>
                  </div>
                  <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold", t.enabled ? "bg-tint text-brand-ink" : "bg-soft text-ink-3")}>{t.enabled ? "Actif" : "En pause"}</span>
                </div>
              );
            })}
          </div>
          <Pager page={shown} total={mine.length} size={PER_PAGE} onPage={setPage} />
        </>
      )}

      {editing && allowed && <TriggerDialog key={editing.key} agentId={agentId} expert={expert} sources={overview.sources} trigger={editing.trigger} onClose={() => setEditing(null)} onSaved={saved} />}
      {revealed && <TriggerKeyDialog trigger={revealed} onClose={() => setRevealed(null)} />}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={removing?.length === 1 ? `Supprimer « ${removing[0].name} » ?` : `Supprimer ${removing?.length ?? 0} déclencheurs ?`}
        description={`${expert.name} ne réagira plus à ces événements.`}
        confirmText="Supprimer"
        destructive
        onConfirm={remove}
      />
    </div>
  );
}
