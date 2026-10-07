import { requireUser } from "@/lib/auth";
import { pinnedWorkspaceId } from "@/lib/tenant";
import { ApiError, handleError, json } from "@/lib/http";

type Ctx = { params: Promise<{ token: string }> };

export async function POST(_request: Request, { params }: Ctx) {
  try {
    const { token } = await params;
    const { db, user } = await requireUser();

    // On a shared database, an invitation to another client's workspace is not valid here.
    const pinned = await pinnedWorkspaceId();
    if (pinned) {
      const { data: inv } = await db.rpc("get_invitation", { p_token: token });
      const row = (Array.isArray(inv) ? inv[0] : null) as { workspace_id: string } | null;
      if (row?.workspace_id !== pinned) throw new ApiError(404, "not_found", "Invitation not found");
    }

    // Pass the verified user id explicitly: under the service-role client auth.uid() is NULL, so the
    // function can't read it from the JWT.
    const { data, error } = await db.rpc("accept_invitation", { p_token: token, p_user: user.id });
    if (error) throw new ApiError(400, "invalid_request", error.message);

    return json({ workspace_id: data as string });
  } catch (e) {
    return handleError(e);
  }
}
