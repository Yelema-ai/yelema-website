import { backoffice, BackofficeError } from "@/lib/backoffice";
import { apiError, json, readJson } from "@/lib/http";
import { writeSession } from "@/lib/session";
import { authFailure, notEnabled } from "../_shared";

// First access or a new password: the link the back office sent carries a token; it is consumed
// together with the password the user just chose, and the session opens.
export async function POST(request: Request) {
  const off = notEnabled();
  if (off) return off;
  try {
    const { tokenHash, type, password } = await readJson<{ tokenHash?: string; type?: string; password?: string }>(request);
    if (!tokenHash || !type || !password) return apiError("Ce lien n’est plus valable.", 400, "invalid_link");

    const opened = await backoffice.accept(tokenHash, type, password);
    await writeSession(opened.session);
    return json({ ok: true });
  } catch (e) {
    // A used or expired link comes back as a refusal: say that, not "wrong password".
    if (e instanceof BackofficeError && e.code === "unauthorized") {
      return apiError("Ce lien n’est plus valable. Demandez-en un nouveau.", 401, "invalid_link");
    }
    return authFailure(e);
  }
}
