"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type CollisionDetection, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Layers, Plus, Server, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { CUSTOM_PROVIDER, type LlmLogin, type LlmProvider } from "@/lib/llm";
import { layoutOf, moveItem, scopeParam, type InstanceScope, type LlmGroup, type LlmSetup } from "@/lib/llm-accounts";
import type { ModelGroup } from "@/lib/model-options";
import { cn } from "@/lib/utils";
import { AccountRow } from "./AccountRow";
import { AddAccountDialog } from "./AddAccountDialog";
import { GroupModels } from "./GroupModels";
import { ProviderLogo } from "./ProviderLogo";

export type Catalogues = { catalogue: LlmProvider[]; logins: LlmLogin[] };

/** Nom, marque et nature d'un groupe, lus sur son premier compte (le catalogue ne connaît pas l'id Hermes). */
export function describe(group: LlmGroup, { catalogue, logins }: Catalogues) {
  const first = group.accounts[0];
  const login = logins.find((l) => l.id === first?.provider);
  if (first?.provider === CUSTOM_PROVIDER) return { name: first.name ?? "Serveur privé", family: "custom", login: false };
  if (login) return { name: login.label.split(" — ")[0]!, family: login.family, login: true };
  const known = catalogue.find((p) => p.id === first?.provider);
  return { name: known?.label.split(" — ")[0] ?? group.provider, family: known?.family ?? group.provider, login: false };
}

// Un seul DndContext pour les deux niveaux (des contextes imbriqués perdent le glisser à la souris) :
// `g:` un fournisseur, `a:` un compte ; un élément ne se pose que sur un élément de sa nature.
const G = "g:";
const A = "a:";
const sameKind: CollisionDetection = (args) => {
  const kind = String(args.active.id).slice(0, 2);
  return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => String(c.id).startsWith(kind)) });
};

const kindOf = (provider: string, isLogin: boolean) => (isLogin ? "Connexion" : provider === CUSTOM_PROVIDER ? "Serveur" : provider.endsWith("-oauth") ? "Abonnement" : "Clé");

// Les comptes d'une instance, rangés par fournisseur, dans l'ordre où elle les essaie : tous les
// comptes du premier fournisseur, puis ses modèles de secours, puis le fournisseur suivant, puis le
// moteur Yelema. Glisser enregistre aussitôt le nouvel ordre ; une erreur le remet comme il était.
export function AccountsBoard({ setup, scope, title, picker, scopeLabel, catalogue, logins, customEndpoints, models, onChanged }: Catalogues & {
  setup: LlmSetup;
  scope: InstanceScope;
  title: string;
  /** Le choix de l'instance regardée (admin), dans l'en-tête. */
  picker?: React.ReactNode;
  scopeLabel: string;
  customEndpoints: boolean;
  /** Les modèles par fournisseur ; null tant qu'ils ne sont pas lus. */
  models: ModelGroup[] | null;
  onChanged: () => Promise<void>;
}) {
  const [groups, setGroups] = useState(setup.groups);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => setGroups(setup.groups), [setup.groups]);

  // Un id stable : sans lui, dnd-kit numérote ses attributs ARIA différemment au rendu serveur.
  const dndId = useId();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const save = useCallback(
    async (next: LlmGroup[]) => {
      const before = groups;
      setGroups(next);
      setSaving(true);
      try {
        await apiFetch(`/api/llm/layout?scope=${encodeURIComponent(scopeParam(scope) ?? "own")}`, { method: "PUT", body: JSON.stringify(layoutOf(next, setup.profiles)) });
        await onChanged();
      } catch (e) {
        setGroups(before);
        toast.error((e as Error).message);
      } finally {
        setSaving(false);
      }
    },
    [groups, scope, setup.profiles, onChanged],
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const from = String(active.id);
    const to = String(over?.id ?? "");
    if (!over || from === to) return;
    if (from.startsWith(G)) {
      const ids = groups.map((g) => G + g.provider);
      return void save(moveItem(groups, ids.indexOf(from), ids.indexOf(to)));
    }
    // Un compte reste dans son fournisseur : Hermes range les comptes par fournisseur.
    const gi = groups.findIndex((g) => g.accounts.some((a) => A + a.id === from));
    const ids = groups[gi]?.accounts.map((a) => A + a.id) ?? [];
    if (gi < 0 || !ids.includes(to)) return;
    const accounts = moveItem(groups[gi]!.accounts, ids.indexOf(from), ids.indexOf(to));
    void save(groups.map((g, i) => (i === gi ? { ...g, accounts } : g)));
  };

  return (
    <section className="space-y-3" aria-busy={saving}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-3">
            <Layers className="h-3.5 w-3.5 text-brand" /> {title}
          </h2>
          {picker}
        </div>
        <Button size="sm" onClick={() => setAdding(true)} className="h-8 gap-1.5 rounded-full px-3.5 text-xs max-sm:h-10 max-sm:text-[13px]">
          <Plus className="h-3.5 w-3.5" /> Ajouter un compte
        </Button>
      </div>

      {groups.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[22px] border border-dashed border-line bg-surface/40 p-6 text-center">
          <p className="text-sm text-ink-2">Vos Experts utilisent le moteur Yelema.</p>
          <Button size="sm" variant="outline" onClick={() => setAdding(true)} className="h-8 gap-1.5 rounded-full px-3.5 text-xs max-sm:h-10 max-sm:text-[13px]">
            <Plus className="h-3.5 w-3.5" /> Ajouter un compte
          </Button>
        </div>
      ) : (
        <DndContext id={dndId} sensors={sensors} collisionDetection={sameKind} onDragEnd={onDragEnd}>
          <SortableContext items={groups.map((g) => G + g.provider)} strategy={verticalListSortingStrategy}>
            <ol className="space-y-3">
              {groups.map((g, gi) => {
                const info = describe(g, { catalogue, logins });
                return (
                <GroupCard key={g.provider} group={g} rank={gi} info={info} options={optionsFor(g, models, info.name)} disabled={saving} onModels={(m) => void save(groups.map((x, i) => (i === gi ? { ...x, ...m } : x)))}>
                  <SortableContext items={g.accounts.map((a) => A + a.id)} strategy={verticalListSortingStrategy}>
                      <ul className="space-y-1.5">
                        {g.accounts.map((a, ai) => {
                          const login = logins.some((l) => l.id === a.provider);
                          return <AccountRow key={a.id} account={a} rank={ai + 1} kind={kindOf(a.provider, login)} isLogin={login} onChanged={onChanged} />;
                        })}
                      </ul>
                  </SortableContext>
                </GroupCard>
                );
              })}
            </ol>
          </SortableContext>
        </DndContext>
      )}

      {groups.length > 0 && (
        <p className="flex items-center gap-2 rounded-2xl border border-line bg-soft/40 px-3 py-2 text-xs text-ink-2">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-brand" />
          <span><span className="font-semibold">Dernier recours</span> · Moteur Yelema (inclus dans l’abonnement)</span>
        </p>
      )}

      <AddAccountDialog open={adding} scope={scope} scopeLabel={scopeLabel} catalogue={catalogue} logins={logins} customEndpoints={customEndpoints} onAdded={onChanged} onClose={() => setAdding(false)} />
    </section>
  );
}

/** Les modèles du fournisseur d'un groupe ; à défaut, ceux que ses comptes nomment déjà. */
function optionsFor(group: LlmGroup, models: ModelGroup[] | null, name: string): ModelGroup[] {
  const listed = models?.filter((m) => m.provider === group.provider && m.source !== "yelema") ?? [];
  return listed.length ? listed : [{ provider: group.provider, label: name, source: "account", models: [group.model, ...group.fallbacks].map((id) => ({ id, label: id })) }];
}

function GroupCard({ group, rank, info, options, disabled, onModels, children }: { group: LlmGroup; rank: number; info: ReturnType<typeof describe>; options: ModelGroup[]; disabled: boolean; onModels: (m: { model: string; fallbacks: string[] }) => void; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: G + group.provider });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn("space-y-2.5 rounded-[22px] border border-line bg-surface p-3 sm:p-4", rank === 0 && "border-brand/40 ring-1 ring-brand/20", isDragging && "relative z-10 shadow-xl")}>
      <div className="flex flex-wrap items-center gap-2.5">
        <button type="button" aria-label={`Déplacer ${info.name}`} className="grid h-8 w-6 max-sm:h-10 max-sm:w-9 cursor-grab touch-none place-items-center text-ink-3 hover:text-ink active:cursor-grabbing" {...attributes} {...listeners}>
          <GripVertical className="h-4 w-4" />
        </button>
        {info.family === "custom" ? <span className="grid h-9 w-9 place-items-center rounded-xl bg-soft text-ink-3"><Server className="h-4 w-4" /></span> : <ProviderLogo family={info.family} name={info.name} />}
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 text-[15px] font-semibold text-ink">
            {info.name}
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] max-sm:text-[12px] font-semibold", rank === 0 ? "bg-tint text-brand-ink" : "bg-soft text-ink-3")}>{rank === 0 ? "Principal" : `Secours ${rank}`}</span>
          </p>
          <p className="text-[11px] max-sm:text-[12px] text-ink-3">{group.accounts.length} compte{group.accounts.length > 1 ? "s" : ""}, essayé{group.accounts.length > 1 ? "s" : ""} dans l’ordre</p>
        </div>
        <GroupModels provider={group.provider} options={options} model={group.model} fallbacks={group.fallbacks} onChange={onModels} disabled={disabled} />
      </div>
      {children}
    </li>
  );
}
