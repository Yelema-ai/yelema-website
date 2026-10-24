"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { llmPending, type LlmMember, type LlmOverview, type LlmWritten } from "@/lib/llm";
import { scopeParam, type InstanceScope, type LlmSetup } from "@/lib/llm-accounts";
import { AccountsBoard, describe } from "./AccountsBoard";
import { ExpertModels } from "./ExpertModels";
import { MemberSources } from "./MemberSources";
import { useModelGroups } from "./useModelGroups";
import { YelemaEngine } from "./YelemaEngine";

const REFUSED = "Le fournisseur n’accepte plus cette clé. Vos Experts ne répondent plus tant qu’elle n’est pas remplacée ou retirée.";
// Une pose prend d'ordinaire moins d'une minute par instance ; au-delà, on cesse de relire seul.
const POLL_MS = 4_000;
const POLL_TRIES = 45;
const EMPTY: LlmSetup = { groups: [], state: "applied" };

// Intégrations · Modèles : les comptes de l'instance, le modèle des experts, le moteur Yelema. Un compte
// ne sert qu'une instance : rien n'est partagé avec l'entreprise. L'écran affiche ce que le back-office
// sert et lui demande d'écrire ; il ne garde aucun secret.
export function ModelsView() {
  const [data, setData] = useState<LlmOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<InstanceScope>({ kind: "own" });
  const [tries, setTries] = useState(0);

  const load = useCallback(async () => {
    try {
      setData(await apiFetch<LlmOverview>("/api/llm"));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Tant qu'une pose est en cours, l'état est relu : l'écran passe seul à « En service » ou à l'échec.
  useEffect(() => {
    if (!data || !llmPending(data) || tries >= POLL_TRIES) return;
    const timer = setTimeout(() => {
      setTries((n) => n + 1);
      void load();
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [data, tries, load]);

  const admin = data?.members !== undefined;
  const others = useMemo(() => othersOf(data), [data]);
  // Un administrateur sans instance à lui regarde d'emblée celle d'un autre membre.
  useEffect(() => {
    if (data && admin && !data.mine && others[0]) setScope((s) => (s.kind === "own" ? { kind: "member", id: others[0]!.id } : s));
  }, [data, admin, others]);

  const member = scope.kind === "member" ? data?.members?.find((m) => m.id === scope.id) : undefined;
  const setup = (scope.kind === "member" ? member?.setup : data?.setup) ?? EMPTY;
  const version = setup.groups.map((g) => `${g.provider}:${g.accounts.length}`).join(",");
  const models = useModelGroups(data ? scopeParam(scope) : null, undefined, version);

  const changed = useCallback(
    async (out?: LlmWritten | null) => {
      setTries(0);
      await load();
      if (out) toast.success("Modèle enregistré", { description: out.state === "pending" ? "L’installation sur l’instance est en cours." : undefined });
    },
    [load],
  );

  if (error && !data) return <p className="max-w-xl rounded-xl bg-ko-pale px-4 py-3 text-sm text-ko">{error}</p>;
  if (!data) return <div className="h-40 animate-pulse rounded-[22px] border border-line bg-soft" />;

  const who = member?.name ?? member?.email ?? "ce membre";
  const title = scope.kind === "member" ? `Comptes de l’instance de ${who}` : "Comptes de l’instance";
  const scopeLabel = scope.kind === "member" ? `l’instance de ${who}` : "votre instance";
  const refused = (scope.kind === "member" ? member?.state : data.mine?.state) === "refused";
  const catalogues = { catalogue: data.catalogue ?? [], logins: data.logins ?? [] };

  return (
    <div className="space-y-6">
      <p className="text-[15px] text-ink-2">Branchez vos comptes de modèles d’intelligence artificielle (BYOK) et choisissez le modèle de vos Experts.</p>

      {refused && (
        <div role="alert" className="flex gap-2.5 rounded-[22px] border border-ko/30 bg-ko-pale p-4 text-sm text-ko">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{REFUSED}</p>
        </div>
      )}

      <AccountsBoard
        setup={setup}
        scope={scope}
        title={title}
        picker={admin && others.length > 0 ? <InstancePicker mine={!!data.mine} others={others} value={scope} onChange={setScope} /> : undefined}
        scopeLabel={scopeLabel}
        {...catalogues}
        customEndpoints={data.customEndpoints === true}
        models={models}
        onChanged={() => changed()}
      />

      <ExpertModels key={scopeParam(scope) ?? "own"} scope={scope} setup={setup} yelema={data.yelema} models={models} groupName={(g) => describe(g, catalogues).name} onChanged={changed} />

      {data.yelema && <YelemaEngine yelema={data.yelema} />}

      {admin && data.members && <MemberSources members={data.members} onPick={(id) => setScope(data.members?.find((m) => m.id === id)?.self ? { kind: "own" } : { kind: "member", id })} />}
    </div>
  );
}

/** Les autres membres, sans l'appelant : sa propre instance est « Mon instance ». */
const othersOf = (data: LlmOverview | null): LlmMember[] => (data?.members ?? []).filter((m) => !m.self);

// Le choix de l'instance regardée, compact, dans l'en-tête du bloc des comptes (admin seulement).
function InstancePicker({ mine, others, value, onChange }: { mine: boolean; others: LlmMember[]; value: InstanceScope; onChange: (scope: InstanceScope) => void }) {
  return (
    <select
      aria-label="Instance réglée"
      value={value.kind === "member" ? value.id : "own"}
      onChange={(e) => onChange(e.target.value === "own" ? { kind: "own" } : { kind: "member", id: e.target.value })}
      className="h-7 max-w-[14rem] rounded-full border border-line bg-surface px-2.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-brand/40"
    >
      {mine && <option value="own">Mon instance</option>}
      {others.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name ?? m.email}
        </option>
      ))}
    </select>
  );
}
