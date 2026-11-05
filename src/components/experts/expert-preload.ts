"use client";

import { useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { fresh, pending } from "@/lib/client-cache";
import { profileQuery } from "@/lib/profile-id";
import { sessionsStore } from "@/lib/sessions-client";
import { sparingData, whenIdle } from "@/components/usePrefetch";
import { bootstrapped } from "@/lib/bootstrap-client";
import { driveTree } from "@/lib/drive-store";
import type { JourZero } from "@/lib/jour-zero";
import type { CatalogueExpertDetail, ModelsResponse } from "@/lib/types";

// An Expert's page opens on two reads: its conversations and its models. The menu reads them ahead,
// so the page paints them at once; the same call starts the Expert's process on the instance (its
// first call boots it), which is the wait a member otherwise meets on their first message. The
// conversations come from the sessions store, usually already filled by the tab's bootstrap.
export const modelsKey = (agentId: string, profile: string | null) => `models:${agentId}${profileQuery(profile)}`;

// Read again at most this often: a menu hovered back and forth asks nothing more.
const FRESH_MS = 60_000;
const last = new Map<string, number>();
const inFlight = new Map<string, Promise<void>>();

export const jourZeroKey = (agentId: string, profile: string) => `jour-zero:${agentId}:${profile}`;
export const ficheKey = (catalogueKey: string) => `fiche:${catalogueKey}`;

type ExpertScreen = { models: ModelsResponse | null; jourZero: JourZero | null; fiche: CatalogueExpertDetail | null };

/**
 * The page's first reads besides its conversations (models, day-zero preparation, catalogue entry) in one
 * call to `expert-screen`; each reader joins it, and reads by its own route what it left out.
 */
export function readExpertScreen(agentId: string, profile: string | null, catalogueKey?: string | null): Promise<unknown> {
  const q = profileQuery(profile);
  const mk = modelsKey(agentId, profile);
  const jk = profile && !fresh(jourZeroKey(agentId, profile), FRESH_MS) ? jourZeroKey(agentId, profile) : null;
  const fk = catalogueKey && !fresh(ficheKey(catalogueKey), Infinity) ? ficheKey(catalogueKey) : null;
  const needModels = !fresh(mk, FRESH_MS);
  if (!needModels && !jk && !fk) return Promise.resolve();
  const parts = new URLSearchParams();
  if (profile) parts.set("profile", profile);
  if (fk && catalogueKey) parts.set("fiche", catalogueKey);
  if (!needModels) parts.set("models", "0");
  if (!jk) parts.set("jz", "0");
  const screen = apiFetch<ExpertScreen>(`/api/agents/${agentId}/expert-screen?${parts}`).catch(() => null);
  if (needModels) pending(mk, screen.then((s) => s?.models ?? null), () => apiFetch<ModelsResponse>(`/api/agents/${agentId}/chat/models${q}`), FRESH_MS);
  if (jk) pending(jk, screen.then((s) => s?.jourZero ?? null), () => apiFetch<JourZero>(`/api/agents/${agentId}/experts/${profile}/jour-zero`), FRESH_MS);
  if (fk) pending(fk, screen.then((s) => s?.fiche ?? null), () => apiFetch<{ expert: CatalogueExpertDetail }>(`/api/catalogue/${encodeURIComponent(catalogueKey!)}`).then((d) => d.expert));
  return screen;
}

export function preloadExpert(agentId: string, profile: string | null, catalogueKey?: string | null): Promise<void> {
  const key = `${agentId}${profileQuery(profile)}`;
  const running = inFlight.get(key);
  if (running) return running;
  if (Date.now() - (last.get(key) ?? 0) < FRESH_MS) return Promise.resolve();
  // Shared with the page's own reads: what it read in the last minute is not asked again.
  const p = Promise.allSettled([sessionsStore.read(agentId, profile, FRESH_MS), readExpertScreen(agentId, profile, catalogueKey)]).then(() => {
    last.set(key, Date.now());
    inFlight.delete(key);
  });
  inFlight.set(key, p);
  return p;
}

export { sparingData };

/** A row on screen: only its conversations, grouped with every other row's into one read. */
export function preloadSpace(agentId: string, profile: string | null): void {
  void sessionsStore.read(agentId, profile, FRESH_MS).catch(() => undefined);
}

// How many Experts, from the top of the menu, are read ahead once the page is idle: one at a time,
// behind what the page itself loads. A dozen at once would take a slow line from the page itself;
// the others are read when a pointer or a finger reaches their row (ExpertItem).
export const READ_AHEAD = 4;
const STAGGER_MS = 1_500;
// Behind the page's own first reads.
const WARM_AFTER_MS = 4_000;

export function useReadAhead(experts: { agentId: string; profileId: string; catalogueKey?: string | null }[]): void {
  const list = experts
    .slice(0, READ_AHEAD)
    .map((e) => `${e.agentId}\n${e.profileId}\n${e.catalogueKey ?? ""}`)
    .join("|");
  useEffect(() => {
    if (!list || sparingData()) return;
    let stop = false;
    const todo = list.split("|").map((s) => s.split("\n") as [string, string, string]);
    const next = () => {
      // A hidden tab reads nothing ahead; the Expert opened later reads for itself.
      if (stop || document.visibilityState !== "visible") return;
      const item = todo.shift();
      if (!item) return;
      void preloadExpert(item[0], item[1], item[2] || null).then(() => {
        if (!stop) setTimeout(() => idle(next), STAGGER_MS);
      });
    };
    const t = setTimeout(() => idle(next), STAGGER_MS);
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [list]);
}

function idle(fn: () => void) {
  const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (ric) ric(fn, { timeout: 5_000 });
  else setTimeout(fn, 200);
}

// Once the tab's bootstrap is in, the menu's screens (Conversations, Livrables) are read while idle: every
// Expert's conversations in one grouped read, every instance's drive. Data only, never their code.
const warmed = new Set<string>();
export function useWarmMenu(ownAgentId: string | null, experts: { agentId: string; profileId: string }[]): void {
  const list = experts.map((e) => `${e.agentId}\n${e.profileId}`).join("|");
  useEffect(() => {
    if (!ownAgentId || !list || warmed.has(`${ownAgentId}|${list}`)) return;
    let stop = false;
    const t = setTimeout(() => {
      void bootstrapped().then(() =>
        whenIdle(() => {
          if (stop) return;
          warmed.add(`${ownAgentId}|${list}`);
          const all = list.split("|").map((s) => s.split("\n") as [string, string]);
          for (const [agentId, profile] of all) void sessionsStore.read(agentId, profile, FRESH_MS).catch(() => undefined);
          for (const agentId of new Set([ownAgentId, ...all.map(([a]) => a)])) void driveTree(agentId).catch(() => undefined);
        })
      );
    }, WARM_AFTER_MS);
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [ownAgentId, list]);
}
