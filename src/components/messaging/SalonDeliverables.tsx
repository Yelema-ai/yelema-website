"use client";

import { useMemo, useState } from "react";
import { FileText, Folder, RotateCw, Search, X } from "lucide-react";
import { shortName, type BuzzEntry } from "@/lib/buzz";
import { docKind } from "@/lib/drive-links";
import { matchesDriveQuery } from "@/lib/drive-order";
import { relativeFr } from "@/lib/fr-dates";
import type { SalonDeliverable } from "@/lib/salon-deliverables";
import { cn } from "@/lib/utils";
import { DOC_TONE } from "@/components/files/preview-siblings";
import { formatMtime } from "@/components/files/types";
import { ParticipantAvatar } from "@/components/messaging/ParticipantAvatar";

// Onglet « Livrables » d'un salon, au format de la page Livrables : recherche, une ligne par fichier, l'Expert qui
// l'a fait avec son visage, la date. Un lien signé et court, en lecture seule ; le back-office vérifie que vous êtes
// du salon. La lecture est celle du fil (salon-deliverables-store) : ce qui a déjà été lu s'affiche tout de suite.

export interface SalonDeliverablesProps {
  items: SalonDeliverable[] | null;
  error: string | null;
  loading: boolean;
  onRefresh: () => void;
  directory: BuzzEntry[];
}

const staleHint = (d: SalonDeliverable) => (d.checkedAt ? `mis à jour ${relativeFr(Date.parse(d.checkedAt))}` : "mise à jour en cours");

export function SalonDeliverables({ items, error, loading, onRefresh, directory }: SalonDeliverablesProps) {
  const [query, setQuery] = useState("");

  const shown = useMemo(() => [...(items ?? [])].filter((d) => matchesDriveQuery(d.title, query)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [items, query]);
  const maker = (d: SalonDeliverable) => directory.find((e) => e.type === "expert" && (e.profil === d.expertId || shortName(e.nom) === shortName(d.auteur))) ?? null;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5" aria-busy={items === null && !error}>
      <div className="flex items-center gap-2">
        <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3 sm:max-w-sm">
          <Search className="size-4 shrink-0 text-ink-3" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un livrable"
            aria-label="Rechercher un livrable"
            className="h-full min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Effacer la recherche" className="grid size-8 place-items-center rounded-lg text-ink-3 hover:bg-soft">
              <X className="size-4" />
            </button>
          )}
        </label>
        <button type="button" onClick={onRefresh} aria-label="Actualiser les livrables" title="Actualiser" className="ml-auto grid size-11 place-items-center rounded-xl border border-line bg-surface text-ink-3 hover:bg-soft hover:text-ink">
          <RotateCw className={cn("size-4", loading && "animate-spin")} />
        </button>
      </div>

      <div className="mt-4">
        {error && !items && <p role="alert" className="rounded-xl bg-ko-pale px-4 py-3 text-sm text-ko">{error}</p>}
        {items === null && !error ? (
          <ul className="overflow-hidden rounded-card border border-line bg-surface" aria-label="Chargement des livrables">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
                <span className="size-10 shrink-0 animate-pulse rounded-xl bg-soft" />
                <span className="h-3.5 w-1/2 animate-pulse rounded bg-soft" />
              </li>
            ))}
          </ul>
        ) : items && shown.length === 0 ? (
          <p className="flex flex-col items-center gap-2 rounded-card border border-dashed border-line py-14 text-center text-sm text-ink-3">
            <Folder className="size-6" />
            {items.length === 0 ? "Les livrables des Experts du salon apparaîtront ici." : "Aucun livrable ne correspond."}
          </p>
        ) : items ? (
          <ul className="overflow-hidden rounded-card border border-line bg-surface">
            <li className="hidden grid-cols-[minmax(0,1fr)_180px_150px] gap-4 border-b border-line px-4 py-2.5 text-xs font-semibold text-ink-3 md:grid">
              <span>Nom</span>
              <span>Expert</span>
              <span>Modifié le</span>
            </li>
            {shown.map((d) => {
              const who = maker(d);
              const kind = docKind(d.title);
              const row = (
                <>
                  <span className="flex min-w-0 items-center gap-3">
                    <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl text-white", kind === "other" ? "bg-tint text-brand-ink" : DOC_TONE[kind])}>
                      <FileText className="size-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-ink">{d.title}</span>
                      <span className="block truncate text-xs text-ink-3 md:hidden">
                        {shortName(d.auteur)}, {formatMtime(Date.parse(d.updatedAt))}
                        {d.stale && ` · ${staleHint(d)}`}
                      </span>
                    </span>
                  </span>
                  <span className="hidden min-w-0 items-center gap-2 text-sm text-ink-2 md:flex">
                    <ParticipantAvatar entry={who} name={d.auteur} />
                    <span className="truncate">{shortName(d.auteur)}</span>
                  </span>
                  <span className="hidden text-sm text-ink-2 md:block">
                    {formatMtime(Date.parse(d.updatedAt))}
                    {d.stale && <span className="block text-xs text-ink-3">{staleHint(d)}</span>}
                  </span>
                </>
              );
              const cls = "grid min-h-16 w-full grid-cols-[minmax(0,1fr)] items-center gap-x-4 gap-y-1 px-4 py-3 text-left md:grid-cols-[minmax(0,1fr)_180px_150px]";
              return (
                <li key={d.id} className="border-b border-line last:border-0">
                  {d.url ? (
                    <a href={d.url} target="_blank" rel="noopener noreferrer" className={cn(cls, "hover:bg-soft")}>
                      {row}
                    </a>
                  ) : (
                    <div className={cls}>{row}</div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
