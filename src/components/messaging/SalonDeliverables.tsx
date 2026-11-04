"use client";

import { useEffect, useState } from "react";
import { ExternalLink, FileText, Loader2, RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { SalonDeliverable } from "@/lib/backoffice";
import { Button } from "@/components/ui/button";

// Onglet « Livrables » d'un salon : les fichiers que ses Experts ont rangés pour le salon, mêmes règles que la page
// Livrables (lien signé et court, lecture seule). Le back-office vérifie que vous êtes du salon.

const moment = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function SalonDeliverables({ salon }: { salon: string }) {
  const [items, setItems] = useState<SalonDeliverable[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let stop = false;
    setItems(null);
    setError(null);
    apiFetch<{ items: SalonDeliverable[] }>(`/api/buzz/salons/${salon}/livrables`, undefined, "Les livrables du salon sont indisponibles").then(
      (r) => !stop && setItems(r.items),
      (e: unknown) => !stop && setError(e instanceof Error ? e.message : "Les livrables du salon sont indisponibles."),
    );
    return () => {
      stop = true;
    };
  }, [salon, tick]);

  return (
    <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4" aria-busy={items === null && !error}>
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-3">Ce que les Experts du salon y ont déposé. Un lien s’ouvre pendant 15 minutes.</p>
        <Button variant="outline" size="icon" aria-label="Actualiser les livrables" onClick={() => setTick((t) => t + 1)}>
          <RefreshCw />
        </Button>
      </div>
      {error && <p role="alert" className="rounded-xl bg-ko-pale px-4 py-3 text-sm text-ko">{error}</p>}
      {items === null && !error && <p className="flex items-center gap-2 text-sm text-ink-3"><Loader2 className="h-4 w-4 animate-spin" />Chargement…</p>}
      {items?.length === 0 && <p className="text-sm text-ink-3">Aucun livrable pour l’instant. Demandez-en un à l’un de vos Experts avec « @ ».</p>}
      <ul className="space-y-2">
        {items?.map((d) => (
          <li key={d.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-tint text-brand"><FileText className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-ink">{d.title}</span>
              <span className="block truncate text-xs text-ink-3">{d.auteur} · {moment(d.updatedAt)}{d.folder ? ` · ${d.folder}` : ""}</span>
            </span>
            {d.url && (
              <Button asChild variant="outline" size="sm">
                <a href={d.url} target="_blank" rel="noopener noreferrer"><ExternalLink />Ouvrir</a>
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
