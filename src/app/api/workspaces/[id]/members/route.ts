import { requireMember, requireUser } from "@/lib/auth";
import { ApiError, handleError, json } from "@/lib/http";
import type { Invitation, WorkspaceMember } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { db, user } = await requireUser();
    const role = await requireMember(db, id, user.id);

    const { data: members, error } = await db.rpc("get_workspace_members", { p_workspace: id });
    if (error) throw new ApiError(500, "db_error", error.message);

    let invitations: Invitation[] = [];
    if (role === "admin") {
      const { data: inv } = await db
        .from("invitations")
        .select("*")
        .eq("workspace_id", id)
        .order("created_at", { ascending: false });
      invitations = (inv as Invitation[]) ?? [];
    }

    return json({ members: (members as WorkspaceMember[]) ?? [], invitations, role });
  } catch (e) {
    return handleError(e);
  }
}

// Invitations are disabled: the Yelema back-office creates every member and their agent.
export async function POST() {
  try {
    throw new ApiError(403, "forbidden", "Members are managed by the Yelema back-office");
  } catch (e) {
    return handleError(e);
  }
}
