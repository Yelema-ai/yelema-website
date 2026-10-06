import { backoffice } from "@/lib/backoffice";
import { apiError, json, readJson } from "@/lib/http";
import { writeSession } from "@/lib/session";
import { authFailure, notEnabled } from "../_shared";

// Sign in through the back office: it checks the password, then that the member and the client
// are not suspended. The session it returns is kept in an httpOnly cookie; the page gets none of it.
export async function POST(request: Request) {
  const off = notEnabled();
  if (off) return off;
  try {
    const { email, password } = await readJson<{ email?: string; password?: string }>(request);
    const mail = (email ?? "").trim();
    if (!mail || !password) return apiError("Adresse ou mot de passe incorrect.", 401, "unauthorized");

    const opened = await backoffice.login(mail, password);
    await writeSession(opened.session);
    return json({ ok: true });
  } catch (e) {
    return authFailure(e);
  }
}
