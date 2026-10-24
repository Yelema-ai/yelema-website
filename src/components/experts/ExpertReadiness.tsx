"use client";

import { useEffect, useState } from "react";
import { Check, CircleDashed, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { readiness, type JourZero } from "@/lib/jour-zero";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const TONE = {
  ready: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  partial: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  absent: "bg-soft text-ink-3",
};

// Whether the expert has done its day-zero preparation: a chip, and its checks behind it.
export function ExpertReadiness({
  agentId,
  profileId,
  expertName,
  onOpenTools,
  className,
}: {
  agentId: string;
  profileId: string;
  expertName: string;
  onOpenTools: () => void;
  className?: string;
}) {
  const [jz, setJz] = useState<JourZero | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    apiFetch<JourZero>(`/api/agents/${agentId}/experts/${profileId}/jour-zero`).then(
      (r) => live && setJz(r),
      () => undefined
    );
    return () => {
      live = false;
    };
  }, [agentId, profileId]);

  if (!jz) return null;
  const r = readiness(jz);
  const Icon = r.state === "ready" ? Check : CircleDashed;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Voir sa préparation"
        className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold", TONE[r.state], className)}
      >
        <Icon className="size-3.5" /> {r.label}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Préparation de {expertName}</DialogTitle>
            <DialogDescription>
              {r.state === "absent"
                ? `${expertName} n’a pas encore fait sa préparation du premier jour.`
                : `Ce que ${expertName} a vérifié avant de se mettre au travail${jz.date ? `, le ${new Date(jz.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}` : ""}.`}
            </DialogDescription>
          </DialogHeader>
          {jz.checks.length > 0 && (
            <ul className="flex flex-col gap-3">
              {jz.checks.map((c) => (
                <li key={c.id} className="flex gap-2.5">
                  <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full", c.ok ? TONE.ready : TONE.partial)}>
                    {c.ok ? <Check className="size-3" /> : <X className="size-3" />}
                  </span>
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold text-ink">{c.label}</p>
                    {c.detail && <p className="text-ink-3">{c.detail}</p>}
                    {c.id === "outils" && (
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          onOpenTools();
                        }}
                        className="mt-0.5 text-xs font-semibold text-brand-ink hover:underline"
                      >
                        Ouvrir les connecteurs
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
