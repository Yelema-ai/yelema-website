"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { relativeFr } from "@/lib/fr-dates";
import { GOAL_STATUS_LABELS, deadlineLabel, sortGoals, type Goal, type GoalStatus } from "@/lib/objectifs";
import { todayIso } from "@/lib/routines";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const TONES: Record<GoalStatus, string> = {
  actif: "bg-tint text-brand-ink",
  atteint: "bg-emerald-100 text-emerald-800",
  bloque: "bg-red-100 text-red-800",
  en_pause: "bg-amber-100 text-amber-800",
};

// Les objectifs que l'expert suit dans la durée, en lecture seule : on agit dessus dans la conversation.
export function ExpertGoals({ agentId, expert }: { agentId: string; expert: { profileId: string; name: string } }) {
  const [data, setData] = useState<{ objectifs: Goal[]; available: boolean } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      setData(await apiFetch(`/api/agents/${agentId}/objectifs?expert=${encodeURIComponent(expert.profileId)}`));
    } catch {
      setLoadError(true);
    }
  }, [agentId, expert.profileId]);

  useEffect(() => {
    void load();
  }, [load]);

  const panel = "mt-5 rounded-[22px] border bg-card p-4 sm:p-5";
  if (!data) {
    return (
      <div className={cn(panel, "flex flex-col items-center gap-3 py-12 text-center text-sm text-ink-3")}>
        {loadError ? (
          <>
            <p className="text-ink-2">Impossible de charger les objectifs.</p>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Réessayer
            </Button>
          </>
        ) : (
          <p className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement des objectifs…
          </p>
        )}
      </div>
    );
  }
  if (!data.available || data.objectifs.length === 0) {
    return (
      <section className={panel}>
        <p className="text-sm text-ink-3">
          {data.available
            ? `Aucun objectif. Demandez à ${expert.name}, dans la conversation, de suivre un objectif : il sera suivi ici, étape par étape.`
            : "Les objectifs arrivent avec la prochaine mise à jour de votre espace."}
        </p>
      </section>
    );
  }

  const today = todayIso();
  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-line bg-card">
      {sortGoals(data.objectifs).map((g) => {
        const deadline = deadlineLabel(g, today);
        const isOpen = open === g.id;
        const progress = g.dernierProgresLe ? Date.parse(g.dernierProgresLe) : Number.NaN;
        return (
          <div key={g.id} className="border-b border-line last:border-0">
            <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : g.id)} className="flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-soft/60">
              <div className="min-w-0 flex-1 leading-tight">
                <p className="line-clamp-2 text-[14.5px] font-semibold text-ink">{g.titre}</p>
                <p className="mt-1 text-[12.5px] text-ink-3">
                  {g.statut === "actif" && g.prochaine ? `Prochaine étape : ${g.prochaine}` : g.raison ?? g.resultat}
                </p>
                <p className="mt-1 text-[12px] text-ink-3">
                  {deadline ? `Échéance ${deadline}` : "Sans échéance"}
                  {Number.isNaN(progress) ? "" : ` · avancé ${relativeFr(progress)}`}
                  {g.proposition ? " · nouveau plan proposé" : ""}
                </p>
              </div>
              <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold", TONES[g.statut])}>{GOAL_STATUS_LABELS[g.statut]}</span>
              <ChevronDown className={cn("mt-1 size-4 shrink-0 text-ink-3 transition-transform", isOpen && "rotate-180")} />
            </button>
            {isOpen && (
              <div className="mx-4 mb-3.5 grid gap-2.5 rounded-xl bg-soft px-4 py-3 text-[13.5px] leading-relaxed text-ink">
                {g.resultat && (
                  <p>
                    <span className="font-semibold">Résultat attendu : </span>
                    {g.resultat}
                  </p>
                )}
                {g.raison && (
                  <p>
                    <span className="font-semibold">{g.statut === "bloque" ? "Bloqué : " : "Raison : "}</span>
                    {g.raison}
                  </p>
                )}
                {(g.prochaine || g.aSuivre.length > 0) && (
                  <div>
                    <p className="font-semibold">À faire</p>
                    <ol className="ml-5 list-decimal">
                      {[g.prochaine, ...g.aSuivre].filter((s): s is string => Boolean(s)).map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ol>
                  </div>
                )}
                {g.etapesFaites.length > 0 && (
                  <div>
                    <p className="font-semibold">Déjà fait</p>
                    <ul className="ml-5 list-disc text-ink-2">
                      {g.etapesFaites.map((e, i) => (
                        <li key={i}>{e.texte}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {g.proposition && (
                  <div className="rounded-lg border border-brand/20 bg-card px-3 py-2">
                    <p className="font-semibold">Nouveau plan proposé par {expert.name}</p>
                    <p className="whitespace-pre-line">{g.proposition}</p>
                    <p className="mt-1 text-[12.5px] text-ink-3">Pour l’accepter ou le changer, répondez-lui dans la conversation.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
