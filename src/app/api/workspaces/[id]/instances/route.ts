import { requireAdmin, requireUser } from "@/lib/auth";
import { backoffice, BackofficeError } from "@/lib/backoffice";
import { ApiError, handleError, json } from "@/lib/http";
import { authViaBackoffice } from "@/lib/runtime-config";
import { readSession } from "@/lib/session";
import type { WorkspaceInstance } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

// `GET /api/workspaces/{id}/instances` — the workspace's instances, for its admins: a NAME and who
// it belongs to, nothing else. It is a list to read, not a way in: no instance id, no state, no
// link. An admin still reaches only their own instance (see agentAccessRole in lib/auth).
export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { db, user } = await requireUser();
    await requireAdmin(db, id, user.id);

    if (authViaBackoffice()) {
      // The back office lists them itself, already without any instance id.
      const session = await readSession();
      if (!session) throw new ApiError(401, "unauthorized", "Sign in required");
      try {
        const items = await backoffice.instances(session.accessToken);
        return json({
          instances: items.map(
            (i): WorkspaceInstance => ({
              name: i.instance.name,
              member_email: i.member.email,
              created_by_email: null,
              created_at: i.instance.createdAt,
              state: i.instance.state,
              experts: i.instance.experts.map((e) => e.key),
            })
          ),
        });
      } catch (e) {
        if (e instanceof BackofficeError) throw new ApiError(e.status, e.code, e.message);
        throw e;
      }
    }

    const [{ data: rows, error }, { data: members }] = await Promise.all([
      db
        .from("agents")
        .select("name, owner_user_id, created_by, created_at")
        .eq("workspace_id", id)
        .order("created_at", { ascending: true }),
      db.rpc("get_workspace_members", { p_workspace: id }),
    ]);
    if (error) throw new ApiError(500, "db_error", error.message);

    const emailById = new Map(((members ?? []) as { user_id: string; email: string }[]).map((m) => [m.user_id, m.email]));
    const email = (userId: string | null) => (userId && emailById.get(userId)) || null;

    type Row = { name: string | null; owner_user_id: string | null; created_by: string | null; created_at: string };
    const instances: WorkspaceInstance[] = ((rows ?? []) as Row[]).map((r) => ({
      name: r.name,
      member_email: email(r.owner_user_id),
      created_by_email: email(r.created_by),
      created_at: r.created_at,
    }));
    return json({ instances });
  } catch (e) {
    return handleError(e);
  }
}
