import { backoffice } from "@/lib/backoffice";
import { json } from "@/lib/http";
import { clearSession, readSession } from "@/lib/session";
import { notEnabled } from "../_shared";

// Sign out: the back office closes the session, and the cookie goes whatever it answers.
export async function POST() {
  const off = notEnabled();
  if (off) return off;
  const session = await readSession();
  if (session) await backoffice.logout(session.accessToken).catch(() => undefined);
  await clearSession();
  return json({ ok: true });
}
