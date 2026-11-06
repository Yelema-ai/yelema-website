// While the team ships an update the experts answer slower, then the open page runs old code. The
// app reads one small status: `maintenance` (switched on by the back office before a push, off
// after) and the deployment's `version`. From them, what the member sees.

/** How often a visible page asks; hidden, never, and once when it shows again if a tick was due. */
// 60 s (was 150 s): an update of the Experts can be short, and was over before some pages saw it (Leslie, 06/11).
export const DEPLOY_POLL_MS = 60_000;

export interface DeployStatus {
  version: string;
  maintenance: boolean;
}

/**
 * `maintenance`: the banner, « Mise à jour » on the expert, a held reply said to be received.
 * `updated`: the update is over and this page runs the previous version, « Actualiser ».
 * `done`: the update this page saw is over and the page is current (an update of the Experts only):
 * said until the member closes it, so it is not missed (Leslie, 06/11).
 */
export type DeployPhase = "idle" | "maintenance" | "updated" | "done";

/** `loaded` is the version the page started with, `current` what the server says now. */
export function deployPhase(loaded: string | null, current: DeployStatus | null): DeployPhase {
  if (!current) return "idle";
  if (current.maintenance) return "maintenance";
  if (loaded && current.version !== loaded) return "updated";
  return "idle";
}

/** Anything but a well-formed answer counts as "nothing to say": never a banner on a guess. */
export function parseDeployStatus(data: unknown): DeployStatus | null {
  if (!data || typeof data !== "object") return null;
  const { version, maintenance } = data as { version?: unknown; maintenance?: unknown };
  if (typeof version !== "string" || !version) return null;
  return { version, maintenance: maintenance === true };
}
