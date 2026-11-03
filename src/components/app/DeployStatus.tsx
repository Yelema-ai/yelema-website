"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { browserPollEnv, startPoll } from "@/lib/poll";
import { DEPLOY_POLL_MS, deployPhase, parseDeployStatus, type DeployPhase, type DeployStatus } from "@/lib/deploy-status";
import { cn } from "@/lib/utils";

// While Yelema's team ships an update the member is told, instead of guessing at a bug: a banner in
// the top bar, « Mise à jour » on the expert's chip, a held reply said to be received. Once it is
// over and the page runs the previous version, one toast offers to refresh.
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

  useEffect(() => {
    setForced(forcedPhase());
    let live = true;
    const ask = () =>
      apiFetch<unknown>("/api/deploy").then(
        (data) => {
          const s = parseDeployStatus(data);
          if (!live || !s) return;
          // The first answer is the version this page runs; a page opened during an update runs the
          // new one only once the update is over, so the baseline waits for a quiet answer.
          if (!loaded.current && !s.maintenance) loaded.current = s.version;
          setStatus(s);
        },
        () => undefined
      );
    const poll = startPoll(ask, { everyMs: DEPLOY_POLL_MS }, browserPollEnv());
    return () => {
      live = false;
      poll.stop();
    };
  }, []);

  const phase = forced ?? deployPhase(loaded.current, status);

  useEffect(() => {
    if (phase !== "updated") return;
    toast("Mise à jour terminée", {
      id: "mise-a-jour-terminee",
      action: { label: "Actualiser", onClick: () => window.location.reload() },
      duration: Infinity,
    });
  }, [phase]);

  return <DeployContext.Provider value={phase}>{children}</DeployContext.Provider>;
}

/** The small turning ring the update states share. */
export function UpdateSpinner({ className }: { className?: string }) {
  return <span aria-hidden className={cn("inline-block size-3.5 shrink-0 animate-spin rounded-full border-2 border-amber-300 border-t-amber-700 dark:border-amber-500/40 dark:border-t-amber-300", className)} />;
}

const UPDATE_TEXT = "Mise à jour en cours. Vos Experts répondent un peu plus lentement.";

/** While an update runs: one thin strip under the top bar, on every screen. No chip beside an Expert's name
 *  nor pill in the header, which squeezed the tabs (Leslie, 03/11: « visuellement pas ouf »). */
export function UpdateStrip() {
  if (useDeployPhase() !== "maintenance") return null;
  return (
    <div role="status" className="flex items-center gap-2.5 border-b border-amber-200 bg-amber-50 px-4 py-2 text-[13px] font-semibold leading-snug text-amber-800 md:px-8 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
      <UpdateSpinner />
      <span>{UPDATE_TEXT}</span>
    </div>
  );
}
