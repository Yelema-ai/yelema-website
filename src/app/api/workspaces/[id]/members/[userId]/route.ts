import { requireAdmin, requireUser } from "@/lib/auth";
import { ApiError, handleError, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string; userId: string }> };

// Remove a teammate. Not yourself, and not the workspace's owner (its first admin, set up by Yelema).
// Their pending access links go too, so an old link can't bring them back.
export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { id, userId } = await params;
    const { db, user } = await requireUser();
    await requireAdmin(db, id, user.id);
    if (userId === user.id) throw new ApiError(400, "invalid_request", "Vous ne pouvez pas vous retirer vous-même.");

    const { data: ws } = await db.from("workspaces").select("owner_id").eq("id", id).maybeSingle();
    if (ws?.owner_id === userId) throw new ApiError(400, "invalid_request", "Le compte principal de l'espace ne peut pas être retiré.");

    const { error } = await db.from("memberships").delete().eq("workspace_id", id).eq("user_id", userId);
    if (error) throw new ApiError(500, "db_error", error.message);

    const { data: target } = await db.auth.admin.getUserById(userId);
    if (target.user?.email) {
      await db.from("invitations").delete().eq("workspace_id", id).ilike("email", target.user.email);
    }
    return json({ user_id: userId, removed: true });
  } catch (e) {
    return handleError(e);
  }
}
