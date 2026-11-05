import "server-only";
import { backoffice } from "@/lib/backoffice";
import { memo } from "@/lib/memo";
import { authViaBackoffice, backofficeUrl, deployVersion } from "@/lib/runtime-config";
import { pinnedWorkspaceId } from "@/lib/tenant";

// Whether an update is running (the back office's switch) and which deployment answers. A back office
// that does not answer means "no update running": never a banner on a guess.
const statuses = memo<boolean>({ ttlMs: 30_000, maxEntries: 500, maxFlightMs: 6_000 });

/** `known`: the switch already read with the tab's bootstrap. */
export async function deployStatus(known?: boolean): Promise<{ version: string; maintenance: boolean }> {
  let maintenance = false;
  if (authViaBackoffice() && backofficeUrl()) {
    try {
      const workspace = (await pinnedWorkspaceId()) ?? "";
      if (known !== undefined) statuses.put(workspace, known);
      maintenance = await statuses.get(workspace, async () => (await backoffice.platformStatus())?.maintenance === true);
    } catch {
      // Silent on purpose.
    }
  }
  return { version: deployVersion(), maintenance };
}
