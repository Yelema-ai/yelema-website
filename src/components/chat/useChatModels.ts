"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { cached, cachedFetch } from "@/lib/client-cache";
import { modelsKey } from "@/components/experts/expert-preload";
import { profileQuery } from "@/lib/profile-id";
import type { ModelsResponse } from "@/lib/types";
import type { ModelGroup, ModelOption } from "./types";

export interface ChatModelsState {
  groups: ModelGroup[];
  defaultModel: string | null;
  loading: boolean;
}

// Loads the agent's available models (GET /v1/models) and groups them by provider for the
// composer's model switcher. Failures degrade to an empty list (the agent default still runs).
export function useChatModels(agentId: string, profile: string | null = null): ChatModelsState {
  const q = profileQuery(profile);
  const key = modelsKey(agentId, profile);
  // Back on an expert already seen, or read ahead by the menu: its list at once, read again past a minute.
  const [state, setState] = useState<ChatModelsState>(() => {
    const kept = cached<ModelsResponse>(key);
    return kept ? toState(kept) : { groups: [], defaultModel: null, loading: true };
  });

  useEffect(() => {
    let cancelled = false;
    const kept = cached<ModelsResponse>(key);
    if (kept) setState(toState(kept));
    cachedFetch(key, () => apiFetch<ModelsResponse>(`/api/agents/${agentId}/chat/models${q}`), 60_000)
      .then((next) => {
        if (!cancelled) setState(toState(next));
      })
      .catch(() => {
        if (!cancelled) setState((s) => ({ ...s, loading: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, q, key]);

  return state;
}

function toState(res: ModelsResponse): ChatModelsState {
  const byProvider = new Map<string, ModelOption[]>();
  for (const m of res.data ?? []) {
    // Current builds report the provider slug as `owned_by`; the older metered build used
    // `provider`. Group + send whichever the instance provides.
    const provider = m.owned_by ?? m.provider ?? "model";
    const arr = byProvider.get(provider) ?? [];
    arr.push({ id: m.id, label: m.label, provider });
    byProvider.set(provider, arr);
  }
  // Prefer the explicit default; fall back to whichever model is flagged is_default.
  const defaultModel = res.default_model ?? (res.data ?? []).find((m) => m.is_default)?.id ?? null;
  const groups = [...byProvider.entries()].map(([provider, models]) => ({ provider, models }));
  // Open the menu on the default model's provider: float the group that owns it to the top.
  if (defaultModel) {
    groups.sort((a, b) => {
      const aHas = a.models.some((m) => m.id === defaultModel) ? 0 : 1;
      const bHas = b.models.some((m) => m.id === defaultModel) ? 0 : 1;
      return aHas - bHas;
    });
  }
  return { groups, defaultModel, loading: false };
}
