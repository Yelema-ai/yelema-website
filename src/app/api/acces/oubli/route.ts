import { createAdminClient } from "@/lib/supabase/admin";
import { accessEmail, sendEmail } from "@/lib/email";
import { createAccessLink, normalizeEmail } from "@/lib/access-links";
import { publicSiteOrigin } from "@/lib/site-url";
import { handleError, json, readJson } from "@/lib/http";

// "Mot de passe oublié" from the login page. With email configured, a member gets an access link by
// email; the answer never says whether the account exists. Without email, the page tells them to ask
// an admin for a link instead.
export async function POST(request: Request) {
  try {
    if (!process.env.RESEND_API_KEY) return json({ emailed: false });
    const { email: raw } = await readJson<{ email?: string }>(request);
    const email = normalizeEmail(raw);
    const db = createAdminClient();

    const { data: rows } = await db.rpc("find_user_workspace", { p_email: email });
    const workspaceId = (rows as { workspace_id: string }[] | null)?.[0]?.workspace_id;
    if (workspaceId) {
      const { data: ws } = await db.from("workspaces").select("name").eq("id", workspaceId).maybeSingle();
      const link = await createAccessLink(db, {
        workspaceId,
        email,
        createdBy: null,
        origin: publicSiteOrigin(new URL(request.url).origin),
      });
      await sendEmail({ to: email, ...accessEmail({ workspaceName: ws?.name ?? "Yelema", link, inviter: null, reset: true }) });
    }
    return json({ emailed: true });
  } catch (e) {
    return handleError(e);
  }
}
