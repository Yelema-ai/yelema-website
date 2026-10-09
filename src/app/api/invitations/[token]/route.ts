import { requireUser } from "@/lib/auth";
import { authViaBackoffice } from "@/lib/runtime-config";
import { pinnedWorkspaceId } from "@/lib/tenant";
import { ApiError, handleError, json, dbError } from "@/lib/http";

type Ctx = { params: Promise<{ token: string }> };

export async function POST(_request: Request, { params }: Ctx) {
  try {
    const { token } = await params;
    // Invitations are this app's own (Supabase) way in. Signed in through the back office, members
    // are created there and none exists here.
    if (authViaBackoffice()) throw new ApiError(404, "not_found", "Invitation introuvable.");
    const { db, user } = await requireUser();

    // On a shared database, an invitation to another client's workspace is not valid here.
    const pinned = await pinnedWorkspaceId();
    if (pinned) {
      const { data: inv } = await db.rpc("get_invitation", { p_token: token });
      const row = (Array.isArray(inv) ? inv[0] : null) as { workspace_id: string } | null;
      if (row?.workspace_id !== pinned) throw new ApiError(404, "not_found", "Invitation introuvable.");
    }

    // Pass the verified user id explicitly: under the service-role client auth.uid() is NULL, so the
    // function can't read it from the JWT.
    const { data, error } = await db.rpc("accept_invitation", { p_token: token, p_user: user.id });
    if (error) throw dbError(error, 400);

    return json({ workspace_id: data as string });
  } catch (e) {
    return handleError(e);
  }
}
