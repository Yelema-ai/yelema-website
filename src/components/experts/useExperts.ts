"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { remember, whenKept } from "@/lib/client-cache";
import { useMyAgents } from "@/components/useMyAgents";
import { wakeInstance } from "@/components/app/wake";
import { instanceEvents } from "@/lib/instance-events";
import type { Companion } from "@/lib/companion";
import type { Expert } from "@/lib/types";

/** The name and picture a member just gave an expert, by catalogue key, as the edit dialog got them back. */
export interface LookChange {
  key: string;
  displayName: string | null;
  defaultName: string;
  avatarUrl: string | null;
  defaultAvatarUrl: string | null;
}

// A picture that keeps its address after a change would come back from the browser's and the
// optimizer's cache: a fresh address shows the new one at once. A signed address is left as it is.
function fresh(url: string | null): string | null {
  if (!url || url.includes("?")) return url;
  return `${url}?v=${Date.now().toString(36)}`;
}

/** Les Experts lus par le serveur avec la page, pour l'organisation indiquée. */
export interface InitialExperts {
  workspaceId: string;
  experts: Expert[];
  companion: Companion | null;
  unreadable: unknown[];
  installing: boolean;
  failed: boolean;
  failedExperts: string[];
}

const woken = new Set<string>();

// While the back office installs the experts, the list is read again at this pace (tab visible).
const INSTALL_POLL_MS = 15_000;
// An installation takes minutes. The back office only says "not ready", never "failed": past this
// long the wait is called off, so a failed one does not leave the screen turning forever.
const INSTALL_GIVE_UP_MS = 15 * 60_000;

// When this browser first saw the installation running, kept across reloads (a reload must not
// restart the wait). Null when storage is unavailable: the wait then counts from this page load.
function installSince(workspaceId: string): number {
  const key = `yelema-install:${workspaceId}`;
  try {
    const kept = Number(sessionStorage.getItem(key));
    if (kept > 0) return kept;
    sessionStorage.setItem(key, String(Date.now()));
  } catch {}
  return Date.now();
}

function installOver(workspaceId: string): void {
  try {
    sessionStorage.removeItem(`yelema-install:${workspaceId}`);
  } catch {}
}

export interface UseExperts {
  experts: Expert[];
  /** Yélé, where her profile is installed on the user's instance. */
  companion: Companion | null;
  /** Instances dont les profils n'ont pas pu être lus — à montrer, jamais à taire. */
  unreadable: number;
  /** Vrai tant que le back-office installe encore des experts sur l'instance. */
  installing: boolean;
  /** Vrai quand l'installation dure depuis trop longtemps pour être encore attendue. */
  stalled: boolean;
  /** Vrai quand le back-office dit que l'installation a échoué ; `failedExperts` nomme les experts. */
  failed: boolean;
  failedExperts: string[];
  loading: boolean;
  reload: () => void;
  /**
   * After the member renamed an expert or changed its picture: every screen shows it at once. The
   * back office's reading of the team is kept for a while server-side, so the change wins over it
   * for the rest of the page's life.
   */
  applyLook: (look: LookChange) => void;
}

/**
 * Les Experts d'une organisation, c'est-à-dire les profils Hermes de ses instances.
 *
 * Partagé : la barre latérale, l'accueil et tout écran qui liste les Experts doivent lire la
 * même chose, au même format. Dupliquer ce `fetch` ferait diverger les écrans au premier
 * enrichissement (photo, métier…).
 */
export function useExperts(workspaceId: string | undefined, initial: InitialExperts | null = null): UseExperts {
  const [experts, setExperts] = useState<Expert[]>(initial?.experts ?? []);
  const [companion, setCompanion] = useState<Companion | null>(initial?.companion ?? null);
  const [unreadable, setUnreadable] = useState(initial?.unreadable.length ?? 0);
  const [installing, setInstalling] = useState(initial?.installing ?? false);
  const [stalled, setStalled] = useState(false);
  const [failure, setFailure] = useState({ failed: initial?.failed ?? false, experts: initial?.failedExperts ?? [] });
  const since = useRef<number | null>(null);
  const [loading, setLoading] = useState(!initial);
  const [tick, setTick] = useState(0);
  // A reading renewed in the background does not put the screens back to "loading".
  const quiet = useRef(false);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const [looks, setLooks] = useState<Map<string, { displayName: string; photoUrl: string | null }>>(new Map());
  const applyLook = useCallback((look: LookChange) => {
    setLooks((m) => {
      const prev = m.get(look.key);
      const photo = look.avatarUrl ?? look.defaultAvatarUrl;
      const next = new Map(m);
      // The same picture keeps its address (and stays cached); a new one gets a fresh one.
      const same = prev && prev.photoUrl?.split("?v=")[0] === photo;
      next.set(look.key, { displayName: look.displayName ?? look.defaultName, photoUrl: same ? prev.photoUrl : fresh(photo) });
      return next;
    });
  }, []);
  const shown = useMemo(
    () =>
      looks.size === 0
        ? experts
        : experts.map((e) => {
            const look = e.catalogueKey ? looks.get(e.catalogueKey) : undefined;
            return look ? { ...e, displayName: look.displayName, photoUrl: look.photoUrl ?? e.photoUrl } : e;
          }),
    [experts, looks]
  );

  useEffect(() => {
    if (!workspaceId) return;
    const kept = `experts:${workspaceId}`;
    // The server already read this workspace's experts with the page: nothing to ask until a reload.
    if (tick === 0 && initial?.workspaceId === workspaceId) {
      remember(kept, { experts: initial.experts, companion: initial.companion });
      return;
    }
    let alive = true;
    let answered = false;
    if (!quiet.current) setLoading(true);
    // First reading without the server's: the team this device last showed paints meanwhile.
    const offKept =
      tick === 0
        ? whenKept<{ experts: Expert[]; companion: Companion | null }>(kept, (d) => {
            if (!alive || answered) return;
            setExperts(d.experts);
            setCompanion(d.companion);
            setLoading(false);
          })
        : () => undefined;
    quiet.current = false;
    apiFetch<{ experts: Expert[]; companion?: Companion | null; unreadable: unknown[]; installing?: boolean; failed?: boolean; failedExperts?: string[] }>(
      `/api/experts?workspace=${workspaceId}`
    )
      .then((d) => {
        answered = true;
        if (!alive) return;
        remember(kept, { experts: d.experts, companion: d.companion ?? null });
        setExperts(d.experts);
        setCompanion(d.companion ?? null);
        setUnreadable(d.unreadable.length);
        setInstalling(d.installing === true);
        setFailure({ failed: d.failed === true, experts: d.failedExperts ?? [] });
      })
      .catch(() => {
        // L'appelant reste utilisable sans la liste ; l'écran principal remonte l'erreur.
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
      offKept();
    };
    // `initial` is what the page was rendered with; it does not change afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, tick]);

  // The experts appear on their own as the installation goes: no page to reload.
  useEffect(() => {
    if (!workspaceId) return;
    if (!installing) {
      since.current = null;
      installOver(workspaceId);
      setStalled(false);
      return;
    }
    since.current ??= installSince(workspaceId);
    if (Date.now() - since.current >= INSTALL_GIVE_UP_MS) {
      setStalled(true);
      return;
    }
    const next = () => {
      quiet.current = true;
      setTick((t) => t + 1);
    };
    // Hidden: the next reading waits for the tab to show again. Stream up: the back office's word
    // (`job.done` experts, `instance.changed`) reads at once and the timer waits for the stream to drop.
    const onShown = () => {
      if (document.visibilityState === "hidden") return;
      document.removeEventListener("visibilitychange", onShown);
      next();
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(timer);
      if (!instanceEvents.connected()) timer = setTimeout(() => (document.hidden ? document.addEventListener("visibilitychange", onShown) : next()), INSTALL_POLL_MS);
    };
    arm();
    const offLink = instanceEvents.onConnection(arm);
    const offEvents = instanceEvents.on(null, (e) => (e.type === "instance.changed" || (e.type === "job.done" && e.kind === "experts")) && next());
    return () => {
      clearTimeout(timer);
      offLink();
      offEvents();
      document.removeEventListener("visibilitychange", onShown);
    };
  }, [installing, tick, workspaceId]);

  // An instance asleep takes seconds to answer its first request. Asking it something light as soon
  // as the app opens gets that wait over with before the user opens a chat or a folder. Once per
  // instance and per page load; the answer (the home's conversations) is kept by the sessions store.
  // Not where the page itself asks the instance at once (an expert's space), nor for one running.
  const { agents } = useMyAgents(workspaceId);
  useEffect(() => {
    if (window.location.pathname.startsWith("/experts/")) return;
    for (const agentId of new Set(experts.map((e) => e.agentId))) {
      if (woken.has(agentId)) continue;
      const state = agents.find((a) => a.agent37_id === agentId)?.live_status;
      if (state === "running") continue;
      woken.add(agentId);
      wakeInstance(agentId);
    }
  }, [experts, agents]);

  return { experts: shown, companion, unreadable, installing, stalled, failed: failure.failed, failedExperts: failure.experts, loading, reload, applyLook };
}
