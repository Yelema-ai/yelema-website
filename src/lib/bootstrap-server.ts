import "server-only";
import { appContext } from "@/lib/app-context";
import { backoffice, BackofficeError, type MemberPrefs } from "@/lib/backoffice";
import { deployStatus } from "@/lib/deploy-server";
import type { DriveTree } from "@/lib/drive-paths";
import { instanceDriveTree } from "@/lib/drive-tree-server";
import { within } from "@/lib/first-screen";
import { authViaBackoffice } from "@/lib/runtime-config";
import { readSession } from "@/lib/session";
import { MAX_SPACES, spacesOf, type Space } from "@/lib/sessions-by-profile";

// Past this, a part is left out and the browser reads it itself, as before the bootstrap.
const BUDGET_MS = 2_500;

export interface TabBootstrap {
  agentId: string | null;
  preferences: MemberPrefs | null;
  deploy: { version: string; maintenance: boolean } | null;
  /** The own instance's spaces ("" its home), each its rail and its routine runs. */
  spaces: Record<string, Space> | null;
  tree: DriveTree | null;
}

// The back office's grouped read, else its two routes; a 404 means an older back office.
async function backofficePart(): Promise<{ preferences: MemberPrefs | null; maintenance?: boolean }> {
  const token = authViaBackoffice() ? (await readSession())?.accessToken : null;
  if (!token) return { preferences: null };
  try {
    const b = await backoffice.bootstrap(token);
    return { preferences: b.preferences ?? null, maintenance: b.platform ? b.platform.maintenance === true : undefined };
  } catch (e) {
    if (!(e instanceof BackofficeError) || e.status !== 404) throw e;
    return { preferences: await backoffice.preferences(token).catch(() => null) };
  }
}

/** What the shell reads when a tab opens, in one call (GET /api/bootstrap, contract §3). */
export async function tabBootstrap(): Promise<TabBootstrap> {
  const { initial } = await appContext();
  const experts = initial?.experts?.experts ?? [];
  const agentId = initial?.agents?.[0]?.agent37_id ?? experts[0]?.agentId ?? null;
  const profiles = ["", ...experts.filter((e) => e.agentId === agentId).map((e) => e.profileId)].slice(0, MAX_SPACES);
  const [bo, spaces, tree] = await Promise.all([
    within(backofficePart(), BUDGET_MS),
    agentId ? within(spacesOf(agentId, profiles), BUDGET_MS) : null,
    agentId ? within(instanceDriveTree(agentId), BUDGET_MS) : null,
  ]);
  const deploy = await within(deployStatus(bo?.maintenance), BUDGET_MS);
  return { agentId, preferences: bo?.preferences ?? null, deploy, spaces, tree };
}
