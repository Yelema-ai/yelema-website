import { backoffice } from "@/lib/backoffice";
import { json, readJson } from "@/lib/http";
import { authFailure, notEnabled } from "../_shared";

// "Mot de passe oublié": the back office sends the link, and answers the same whether or not the
// account exists.
export async function POST(request: Request) {
  const off = notEnabled();
  if (off) return off;
  try {
    const { email } = await readJson<{ email?: string }>(request);
    const mail = (email ?? "").trim();
    if (mail) await backoffice.forgot(mail);
    return json({ ok: true });
  } catch (e) {
    return authFailure(e);
  }
}
