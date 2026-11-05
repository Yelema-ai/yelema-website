import "server-only";
import { ownExperts } from "@/lib/app-context";
import { backoffice, BackofficeError, type MemberPrefs } from "@/lib/backoffice";
import { deployStatus } from "@/lib/deploy-server";
import type { DriveTree } from "@/lib/drive-paths";
import { instanceDriveTree } from "@/lib/drive-tree-server";
import { byDeadline, FIRST_SCREEN_BUDGET_MS } from "@/lib/first-screen";
import { authViaBackoffice } from "@/lib/runtime-config";
import { readSession } from "@/lib/session";
import { spacesOf, type Space } from "@/lib/sessions-by-profile";
import { optionalRoute } from "@/lib/optional-route";
import { MAX_SPACES } from "@/lib/sessions-store";


export interface TabBootstrap {
  agentId: string | null;
  preferences: MemberPrefs | null;
  deploy: { version: string; maintenance: boolean } | null;
  /** The own instance's spaces ("" its home), each its rail and its routine runs. */
  spaces: Record<string, Space> | null;
  tree: DriveTree | null;
}

// The back office's grouped read, else its two routes; a 404 means an older back office, not asked again for a while.
const grouped = optionalRoute((token: string) => backoffice.bootstrap(token), { absent: (e) => e instanceof BackofficeError && e.status === 404 });

async function backofficePart(): Promise<{ preferences: MemberPrefs | null; maintenance?: boolean }> {
  const token = authViaBackoffice() ? (await readSession())?.accessToken : null;
  if (!token) return { preferences: null };
  const b = await grouped(token);
  if (!b) return { preferences: await backoffice.preferences(token).catch(() => null) };
  return { preferences: b.preferences ?? null, maintenance: b.platform ? b.platform.maintenance === true : undefined };
}

/** What the shell reads when a tab opens, in one call (GET /api/bootstrap, contract §3), within one budget. */
export async function tabBootstrap(): Promise<TabBootstrap> {
  const left = byDeadline(FIRST_SCREEN_BUDGET_MS);
  const boRead = backofficePart();
  const deploy = left(boRead.then((b) => b.maintenance, () => undefined).then(deployStatus));
  const own = await left(ownExperts());
  const agentId = own?.agentId ?? null;
  const profiles = ["", ...(own?.experts ?? []).filter((e) => e.agentId === agentId).map((e) => e.profileId)].slice(0, MAX_SPACES);
  const [bo, spaces, tree, deployed] = await Promise.all([
    left(boRead),
    agentId ? left(spacesOf(agentId, profiles)) : null,
    agentId ? left(instanceDriveTree(agentId)) : null,
    deploy,
  ]);
  return { agentId, preferences: bo?.preferences ?? null, deploy: deployed, spaces, tree };
}
