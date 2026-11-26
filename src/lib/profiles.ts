import "server-only";
import { listInstanceProfiles } from "@/lib/hermes-profiles";
import { ApiError } from "@/lib/http";
import { DEFAULT_PROFILE, isProfileId, profileQuery } from "@/lib/profile-id";
import type { AgentRow } from "@/lib/types";

export { DEFAULT_PROFILE, profileQuery };

// The profiles an instance really holds, kept for a few minutes: reading them is an exec into the
// instance, too slow to repeat on every chat turn.
const TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; ids: Set<string> }>();

const MAX_KEPT = 2000;

// `ask: false`: only what is already known (mirror, kept reading); null rather than an exec.
async function installedProfiles(row: AgentRow, ask = true): Promise<Set<string> | null> {
  // The back office mirrors the installed profiles on the agents row; prefer it when it's there.
  if (Array.isArray(row.profiles) && row.profiles.length > 0) return new Set(row.profiles);

  const hit = cache.get(row.agent37_id);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.ids;
  if (!ask) return null;
  try {
    const { profiles } = await listInstanceProfiles(row.agent37_id);
    const ids = new Set(profiles.map((p) => p.id));
    cache.delete(row.agent37_id);
    if (cache.size >= MAX_KEPT) cache.delete(cache.keys().next().value!);
    cache.set(row.agent37_id, { at: Date.now(), ids });
    return ids;
  } catch {
    // Unreadable right now: the instance itself still refuses an unknown profile (404).
    return null;
  }
}

// The profile a chat request targets, checked against what is installed on THIS instance — never
// against a fixed list. Empty or "default" is the instance's own home.
// `known`: for a call the instance checks itself (a chat turn answers 404 to an unknown profile), never wait on an exec.
export async function resolveProfile(row: AgentRow, raw: unknown, check: "ask" | "known" = "ask"): Promise<string> {
  if (raw === undefined || raw === null || raw === "" || raw === DEFAULT_PROFILE) return DEFAULT_PROFILE;
  if (typeof raw !== "string" || !isProfileId(raw)) {
    throw new ApiError(400, "invalid_request", "Expert inconnu");
  }
  const installed = await installedProfiles(row, check === "ask");
  if (installed && !installed.has(raw)) {
    throw new ApiError(404, "profile_not_found", "Cet Expert n’est pas installé sur cet espace.");
  }
  return raw;
}
