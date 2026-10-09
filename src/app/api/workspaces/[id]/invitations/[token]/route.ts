import { requireAdmin, requireUser } from "@/lib/auth";
import { ApiError, handleError, json, dbError } from "@/lib/http";
import { authViaBackoffice } from "@/lib/runtime-config";

type Ctx = { params: Promise<{ id: string; token: string }> };

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { id, token } = await params;
    // Invitations only exist with this app's own (Supabase) sign-in.
    if (authViaBackoffice()) throw new ApiError(404, "not_found", "Invitation introuvable.");
    const { db, user } = await requireUser();
    await requireAdmin(db, id, user.id);

    const { error } = await db
      .from("invitations")
      .delete()
      .eq("token", token)
      .eq("workspace_id", id);
    if (error) throw dbError(error);

    return json({ token, deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
