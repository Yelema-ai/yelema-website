import { requireUser } from "@/lib/auth";
import { authViaBackoffice } from "@/lib/runtime-config";
import { pinnedWorkspaceId } from "@/lib/tenant";
import { currentPrincipal } from "@/lib/session";
import { handleError, json, ApiError } from "@/lib/http";
import type { BoMe } from "@/lib/backoffice";
import type { Role, Workspace, WorkspaceWithRole } from "@/lib/types";

export async function GET() {
  try {
    const { db, user } = await requireUser();
    if (authViaBackoffice()) {
      const me = await currentPrincipal();
      return json({ workspaces: me ? [workspaceOf(me)] : [] });
    }
    // A deployment only ever lists its own client's workspace (shared database).
    let query = db.from("memberships").select("role, workspaces(*)").eq("user_id", user.id);
    const pinned = await pinnedWorkspaceId();
    if (pinned) query = query.eq("workspace_id", pinned);
    const { data, error } = await query;
    if (error) throw new ApiError(500, "db_error", error.message);

    const workspaces: WorkspaceWithRole[] = (data ?? [])
      .map((row) => {
        const ws = row.workspaces as unknown as Workspace | null;
        if (!ws) return null;
        return { ...ws, role: row.role as Role };
      })
      .filter((w): w is WorkspaceWithRole => w !== null)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));

    return json({ workspaces });
  } catch (e) {
    return handleError(e);
  }
}

// The one workspace of a user signed in through the back office, in this app's shape.
function workspaceOf(me: BoMe): WorkspaceWithRole {
  return { id: me.workspace.id, name: me.workspace.name, owner_id: "", created_at: "", role: me.user.role };
}

export async function POST() {
  try {
    await requireUser();
    // One client per deployment: the workspace is created and owned by the Yelema back-office.
    throw new ApiError(403, "forbidden", "Workspaces are managed by the back-office");
  } catch (e) {
    return handleError(e);
  }
}
