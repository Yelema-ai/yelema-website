import { requireUser } from "@/lib/auth";
import { handleError, json, ApiError } from "@/lib/http";
import type { Role, Workspace, WorkspaceWithRole } from "@/lib/types";

export async function GET() {
  try {
    const { db, user } = await requireUser();
    const { data, error } = await db
      .from("memberships")
      .select("role, workspaces(*)")
      .eq("user_id", user.id);
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

export async function POST() {
  try {
    await requireUser();
    // One client per deployment: the workspace is created and owned by the Yelema back-office.
    throw new ApiError(403, "forbidden", "Workspaces are managed by the back-office");
  } catch (e) {
    return handleError(e);
  }
}
