import { backoffice } from "@/lib/backoffice";
import { apiError, readJson } from "@/lib/http";
import { openingStep } from "@/lib/signin-steps";
import { answerOpening, authFailure, notEnabled, tooManyTries } from "../_shared";

// Sign in through the back office: it checks the password, then that the member and the client
// are not suspended. The session it returns is kept in an httpOnly cookie; the page gets none of it.
// An account with a second factor gets the code step instead (`/api/auth/mfa`).
export async function POST(request: Request) {
  const off = notEnabled();
  if (off) return off;
  try {
    const { email, password } = await readJson<{ email?: string; password?: string }>(request);
    const mail = (email ?? "").trim();
    if (!mail || !password) return apiError("Adresse ou mot de passe incorrect.", 401, "unauthorized");
    const limited = tooManyTries("login", request, mail);
    if (limited) return limited;

    return await answerOpening(await openingStep(() => backoffice.login(mail, password)), request);
  } catch (e) {
    return authFailure(e);
  }
}
