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

async function installedProfiles(row: AgentRow): Promise<Set<string> | null> {
  // The back office mirrors the installed profiles on the agents row; prefer it when it's there.
  if (Array.isArray(row.profiles) && row.profiles.length > 0) return new Set(row.profiles);

  const hit = cache.get(row.agent37_id);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.ids;
  try {
    const { profiles } = await listInstanceProfiles(row.agent37_id);
    const ids = new Set(profiles.map((p) => p.id));
    cache.set(row.agent37_id, { at: Date.now(), ids });
    return ids;
  } catch {
    // Unreadable right now: the instance itself still refuses an unknown profile (404).
    return null;
  }
}

// The profile a chat request targets, checked against what is installed on THIS instance — never
// against a fixed list. Empty or "default" is the instance's own home.
export async function resolveProfile(row: AgentRow, raw: unknown): Promise<string> {
  if (raw === undefined || raw === null || raw === "" || raw === DEFAULT_PROFILE) return DEFAULT_PROFILE;
  if (typeof raw !== "string" || !isProfileId(raw)) {
    throw new ApiError(400, "invalid_request", "Expert inconnu");
  }
  const installed = await installedProfiles(row);
  if (installed && !installed.has(raw)) {
    throw new ApiError(404, "profile_not_found", "Cet expert n’est pas installé sur cet espace.");
  }
  return raw;
}
