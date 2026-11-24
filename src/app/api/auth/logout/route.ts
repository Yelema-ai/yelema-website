import { backoffice } from "@/lib/backoffice";
import { json } from "@/lib/http";
import { publicConfig } from "@/lib/runtime-config";
import { clearSession, forgetSession, readSession } from "@/lib/session";
import { pinnedWorkspaceId } from "@/lib/tenant";
import { notEnabled } from "../_shared";

// Sign out: the back office closes the session, and the cookie goes whatever it answers.
export async function POST() {
  const off = notEnabled();
  if (off) return off;
  const session = await readSession();
  if (session) await backoffice.logout(session.accessToken).catch(() => undefined);
  const workspace = session ? await pinnedWorkspaceId().catch(() => undefined) : undefined;
  if (session && workspace) forgetSession(workspace, session.accessToken);
  await clearSession();
  const res = json({ ok: true });
  // Where nothing may rest on the device, the browser itself empties this origin's storage, whatever the page did.
  if (publicConfig().deviceCache === "memory") res.headers.set("Clear-Site-Data", '"storage"');
  return res;
}
