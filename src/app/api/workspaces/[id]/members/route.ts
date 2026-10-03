import { requireAdmin, requireMember, requireUser } from "@/lib/auth";
import { createAccessLink, ensureAuthUser, normalizeEmail } from "@/lib/access-links";
import { accessEmail, sendEmail } from "@/lib/email";
import { ApiError, handleError, json, readJson } from "@/lib/http";
import { publicSiteOrigin } from "@/lib/site-url";
import type { WorkspaceMember } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

// The team: everyone in the workspace (all admins), with their name and last sign-in.
export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { db, user } = await requireUser();
    await requireMember(db, id, user.id);

    const { data, error } = await db.rpc("get_workspace_members", { p_workspace: id });
    if (error) throw new ApiError(500, "db_error", error.message);
    const rows = (data as Omit<WorkspaceMember, "name" | "last_sign_in_at">[]) ?? [];
    const members: WorkspaceMember[] = await Promise.all(
      rows.map(async (m) => {
        const { data: u } = await db.auth.admin.getUserById(m.user_id);
        return {
          ...m,
          name: (u.user?.user_metadata?.name as string | undefined)?.trim() || null,
          last_sign_in_at: u.user?.last_sign_in_at ?? null,
        };
      })
    );
    const { data: ws } = await db.from("workspaces").select("owner_id").eq("id", id).maybeSingle();

    return json({ members, owner_id: ws?.owner_id ?? null, email_enabled: Boolean(process.env.RESEND_API_KEY) });
  } catch (e) {
    return handleError(e);
  }
}

// "Ajouter un admin": the account (created if new) joins the workspace now, and gets an access link
// to set a password. Emailed when email is configured; the link is always returned to copy.
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { db, user } = await requireUser();
    await requireAdmin(db, id, user.id);
    const { email: raw } = await readJson<{ email?: string }>(request);
    const email = normalizeEmail(raw);

    const userId = await ensureAuthUser(db, email);
    const { error } = await db
      .from("memberships")
      .upsert({ workspace_id: id, user_id: userId, role: "admin" }, { onConflict: "workspace_id,user_id" });
    if (error) throw new ApiError(500, "db_error", error.message);

    const link = await createAccessLink(db, {
      workspaceId: id,
      email,
      createdBy: user.id,
      origin: publicSiteOrigin(new URL(request.url).origin),
    });
    const { data: ws } = await db.from("workspaces").select("name").eq("id", id).maybeSingle();
    const inviter = (user.user_metadata?.name as string | undefined)?.trim() || user.email || null;
    const { sent } = await sendEmail({
      to: email,
      ...accessEmail({ workspaceName: ws?.name ?? "Yelema", link, inviter, reset: false }),
    });

    return json({ user_id: userId, link, emailed: sent }, 201);
  } catch (e) {
    return handleError(e);
  }
}
