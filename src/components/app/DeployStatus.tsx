"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { bootstrap } from "@/lib/bootstrap-client";
import { usePoll } from "@/components/usePoll";
import { DEPLOY_POLL_MS, deployPhase, parseDeployStatus, type DeployPhase, type DeployStatus } from "@/lib/deploy-status";
import { cn } from "@/lib/utils";

// While Yelema's team ships an update the member is told, instead of guessing at a bug: a banner in
// the top bar, « Mise à jour » on the expert's chip, a held reply said to be received. Once it is
// over and the page runs the previous version, the same strip stays with « Actualiser » until the page
// is reloaded: a toast could be pushed away by other notifications or closed, and then nothing said
// the page was out of date (Leslie, 05/11).
const DeployContext = createContext<DeployPhase>("idle");

export const useDeployPhase = () => useContext(DeployContext);

// Demo and screenshots: `?mise-a-jour=en-cours` or `?mise-a-jour=terminee` on any page.
function forcedPhase(): DeployPhase | null {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("mise-a-jour");
  return v === "en-cours" ? "maintenance" : v === "terminee" ? "updated" : null;
}

export function DeployStatusProvider({ children }: { children: React.ReactNode }) {
  const loaded = useRef<string | null>(null);
  const [status, setStatus] = useState<DeployStatus | null>(null);
  const [forced, setForced] = useState<DeployPhase | null>(null);

  useEffect(() => setForced(forcedPhase()), []);

  const first = useRef(true);
  const ask = useCallback(async () => {
    // The first answer comes with the tab's bootstrap when it has it.
    const boot = first.current ? (await bootstrap())?.deploy : null;
    first.current = false;
    const s = parseDeployStatus(boot ?? (await apiFetch<unknown>("/api/deploy")));
    if (!s) return;
    // The first answer is the version this page runs; a page opened during an update runs the
    // new one only once the update is over, so the baseline waits for a quiet answer.
    if (!loaded.current && !s.maintenance) loaded.current = s.version;
    setStatus(s);
  }, []);
  // A net beside the stream, still every DEPLOY_POLL_MS with it (a missed `job.done` must not hide the banner 5 min).
  usePoll(ask, { everyMs: DEPLOY_POLL_MS, live: true, minMs: DEPLOY_POLL_MS, liveMs: DEPLOY_POLL_MS, wake: { types: ["job.done"], kind: "deploy" } });

  const phase = forced ?? deployPhase(loaded.current, status);

  return <DeployContext.Provider value={phase}>{children}</DeployContext.Provider>;
}

/** The small turning ring the update states share. */
export function UpdateSpinner({ className }: { className?: string }) {
  return <span aria-hidden className={cn("inline-block size-3.5 shrink-0 animate-spin rounded-full border-2 border-amber-300 border-t-amber-700 dark:border-amber-500/40 dark:border-t-amber-300", className)} />;
}

const UPDATE_TEXT = "Mise à jour en cours. Vos Experts répondent un peu plus lentement.";

/** While an update runs: one thin strip under the top bar, on every screen. No chip beside an Expert's name
 *  nor pill in the header, which squeezed the tabs (Leslie, 03/11: « visuellement pas ouf »). Once it is
 *  over, the same strip says so with « Actualiser », and stays until the page is reloaded. */
export function UpdateStrip() {
  const phase = useDeployPhase();
  if (phase === "updated")
    return (
      <div role="status" className="flex items-center gap-2.5 border-b border-ok/25 bg-ok-pale px-4 py-1.5 text-[13px] font-semibold leading-snug text-ink md:px-8">
        <span aria-hidden className="size-2 shrink-0 rounded-full bg-ok" />
        <span className="min-w-0 flex-1">Mise à jour terminée. Actualisez la page pour en profiter.</span>
        <button type="button" onClick={() => window.location.reload()} className="inline-flex h-8 shrink-0 items-center rounded-lg bg-ink px-3 text-[12.5px] font-semibold text-bg hover:opacity-90 pointer-coarse:h-10">
          Actualiser
        </button>
      </div>
    );
  if (phase !== "maintenance") return null;
  return (
    <div role="status" className="flex items-center gap-2.5 border-b border-amber-200 bg-amber-50 px-4 py-2 text-[13px] font-semibold leading-snug text-amber-800 md:px-8 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
      <UpdateSpinner />
      <span>{UPDATE_TEXT}</span>
    </div>
  );
}
