import { requireAdmin, requireMember, requireUser } from "@/lib/auth";
import { createAccessLink } from "@/lib/access-links";
import { accessEmail, sendEmail } from "@/lib/email";
import { ApiError, handleError, json, readJson } from "@/lib/http";
import { publicSiteOrigin } from "@/lib/site-url";

type Ctx = { params: Promise<{ id: string; userId: string }> };

// A fresh access link for a teammate: their first sign-in, or a forgotten password. `send: true`
// also emails it when email is configured.
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id, userId } = await params;
    const { db, user } = await requireUser();
    await requireAdmin(db, id, user.id);
    await requireMember(db, id, userId).catch(() => {
      throw new ApiError(404, "not_found", "Membre introuvable");
    });
    const { send } = await readJson<{ send?: boolean }>(request);

    const { data: target } = await db.auth.admin.getUserById(userId);
    const email = target.user?.email;
    if (!email) throw new ApiError(404, "not_found", "Membre introuvable");

    const link = await createAccessLink(db, {
      workspaceId: id,
      email,
      createdBy: user.id,
      origin: publicSiteOrigin(new URL(request.url).origin),
    });
    let emailed = false;
    if (send) {
      const { data: ws } = await db.from("workspaces").select("name").eq("id", id).maybeSingle();
      emailed = (await sendEmail({ to: email, ...accessEmail({ workspaceName: ws?.name ?? "Yelema", link, inviter: null, reset: true }) })).sent;
    }
    return json({ link, emailed });
  } catch (e) {
    return handleError(e);
  }
}
