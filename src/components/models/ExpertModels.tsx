"use client";

import { useState } from "react";
import { ChevronRight, Cpu } from "lucide-react";
import { toast } from "sonner";
import { useExpertsContext } from "@/components/experts/ExpertsProvider";
import { apiFetch } from "@/lib/api";
import type { LlmModelChoice, LlmWritten, LlmYelema, SettingScope } from "@/lib/llm";
import { layoutOf, scopeParam, type InstanceScope, type LlmGroup, type LlmSetup, type ModelChoice, type ProfileModels } from "@/lib/llm-accounts";
import { anyExpertOverride, fallbackModelGroups, profilesWith, withAllExperts, type ModelGroup } from "@/lib/model-options";
import { ModelPicker } from "./ModelPicker";

/** The Yelema engine's provider id when the server list is out of reach. */
const YELEMA_PROVIDER = "custom:Yelema";
const SAME = "Comme tous les Experts";

// Bloc 2 : le modèle de tous les experts, et au besoin un autre pour un expert. Avec des comptes, la
// liste = leurs fournisseurs + le moteur Yelema, enregistrée dans l'ordre des comptes ; sans compte,
// les modèles Yelema de l'instance du membre (`/api/llm/own/model`).
export function ExpertModels({ scope, setup, yelema, models, groupName, onChanged }: {
  scope: InstanceScope;
  setup: LlmSetup;
  yelema: LlmYelema | null | undefined;
  models: ModelGroup[] | null;
  groupName: (g: LlmGroup) => string;
  onChanged: (out: LlmWritten | null) => Promise<void>;
}) {
  const { experts } = useExpertsContext();
  const [busy, setBusy] = useState(false);
  const [toggled, setToggled] = useState<boolean | null>(null);
  const groups = setup.groups;
  const withAccounts = groups.length > 0;
  const yelemaProvider = models?.find((g) => g.source === "yelema")?.provider ?? YELEMA_PROVIDER;
  const options = models ?? fallbackModelGroups(groups, groupName, yelema ? { provider: yelemaProvider, models: yelema.models } : null);
  const accountOptions = options.filter((g) => g.source !== "yelema");
  const yelemaOptions = options.filter((g) => g.source === "yelema");

  // Sans compte, seul le membre règle les modèles Yelema de sa propre instance.
  const yelemaOnly = !withAccounts && scope.kind === "own" && !!yelema && yelema.models.length > 1;
  const profiles: ProfileModels | undefined = withAccounts ? setup.profiles : yelema ? Object.fromEntries(Object.entries(yelema.own.profiles).map(([p, m]) => [p, { provider: yelemaProvider, model: m }])) : undefined;
  // Fermé par défaut, sauf si un expert a déjà son propre modèle.
  const open = toggled ?? anyExpertOverride(profiles, experts.map((x) => x.profileId));

  if (!withAccounts && !yelemaOnly) {
    return (
      <Shell>
        <p className="text-xs text-ink-3">Les Experts de cette instance utilisent le modèle par défaut du moteur Yelema.</p>
      </Shell>
    );
  }

  async function run(call: () => Promise<LlmWritten | null>) {
    setBusy(true);
    try {
      await onChanged(await call());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const putLayout = (next: LlmGroup[], map: ProfileModels | undefined) =>
    apiFetch<LlmWritten>(`/api/llm/layout?scope=${encodeURIComponent(scopeParam(scope) ?? "own")}`, { method: "PUT", body: JSON.stringify(layoutOf(next, map)) });
  const putYelema = (choice: LlmModelChoice) => apiFetch<LlmWritten>("/api/llm/own/model", { method: "PUT", body: JSON.stringify(choice) });

  function pickAll(choice: ModelChoice | null) {
    if (!withAccounts) return void run(() => putYelema({ model: choice?.model ?? null }));
    const next = choice && withAllExperts(groups, choice);
    if (next) void run(() => putLayout(next, setup.profiles));
  }

  function pickExpert(profile: string, choice: ModelChoice | null) {
    if (!withAccounts) return void run(() => putYelema({ model: choice?.model ?? null, profile }));
    void run(() => putLayout(groups, profilesWith(setup.profiles, profile, choice)));
  }

  const allValue: ModelChoice | null = withAccounts ? { provider: groups[0]!.provider, model: groups[0]!.model } : yelema?.own.model ? { provider: yelemaProvider, model: yelema.own.model } : null;
  const defaultLabel = yelema ? `Par défaut (${yelema.models.find((m) => m.id === yelema.default)?.label ?? yelema.default})` : undefined;

  return (
    <Shell>
      <Row label="Tous les Experts">
        <ModelPicker label="Modèle de tous les Experts" groups={withAccounts ? accountOptions : yelemaOptions} value={allValue} nullLabel={withAccounts ? undefined : defaultLabel} disabled={busy} onChange={pickAll} />
      </Row>
      {withAccounts && <p className="text-[11px] max-sm:text-[12px] text-ink-3">Un modèle d’un autre fournisseur fait passer ce fournisseur en compte principal.</p>}

      {experts.length > 0 && (
        <div className="border-t border-line pt-3">
          <button type="button" aria-expanded={open} onClick={() => setToggled(!open)} className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-3 hover:text-ink">
            <ChevronRight className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`} /> Par expert
          </button>
          {open && (
            <div className="mt-3 space-y-2">
              {experts.map((x) => (
                <Row key={x.profileId} label={x.displayName}>
                  <ModelPicker label={`Modèle de ${x.displayName}`} groups={withAccounts ? options : yelemaOptions} value={profiles?.[x.profileId] ?? null} nullLabel={SAME} disabled={busy} onChange={(c) => pickExpert(x.profileId, c)} />
                </Row>
              ))}
            </div>
          )}
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-[22px] border border-line bg-surface p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-3">
        <Cpu className="h-3.5 w-3.5 text-brand" /> Modèle des Experts
      </h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
      <span className="truncate text-sm font-medium text-ink">{label}</span>
      {children}
    </div>
  );
}
