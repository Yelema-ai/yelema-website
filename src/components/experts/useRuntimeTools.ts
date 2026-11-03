"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { cachedFetch } from "@/lib/client-cache";

// Fixed for an image version: read once per page and instance, shared by every screen.
const CAPS_TTL_MS = 10 * 60_000;

type Caps = { hermesTools: boolean; telegramRelay?: boolean };
const capsOf = (agentId: string) => cachedFetch(`caps:${agentId}`, () => apiFetch<Caps>(`/api/agents/${agentId}/capabilities`), CAPS_TTL_MS);
export const runtimeToolsOf = (agentId: string) => capsOf(agentId).then((r) => r.hermesTools);

/** A member of a team instance reaches Telegram through the gateway's relay, not the instance's bot. */
export function useTelegramRelay(agentId: string | null): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!agentId) return;
    let alive = true;
    capsOf(agentId).then((r) => alive && setOn(r.telegramRelay === true), () => undefined);
    return () => {
      alive = false;
    };
  }, [agentId]);
  return on;
}

// Whether this instance's runtime serves the Hermes-only screens (messaging channels).
// `null` while unknown; a read that failed counts as Hermes (as the route does without the gateway).
export function useRuntimeTools(agentId: string | null): boolean | null {
  const [state, setState] = useState<{ agentId: string; hermesTools: boolean } | null>(null);
  useEffect(() => {
    if (!agentId) return;
    let alive = true;
    runtimeToolsOf(agentId).then(
      (hermesTools) => alive && setState({ agentId, hermesTools }),
      () => alive && setState({ agentId, hermesTools: true })
    );
    return () => {
      alive = false;
    };
  }, [agentId]);
  return state && state.agentId === agentId ? state.hermesTools : null;
}
