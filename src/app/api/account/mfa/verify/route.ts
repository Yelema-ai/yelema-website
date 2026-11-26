import { backoffice, BackofficeError } from "@/lib/backoffice";
import { apiError, handleError, noStore, readJson } from "@/lib/http";
import { forgetSession, writeSession } from "@/lib/session";
import { totpCode } from "@/lib/signin-steps";
import { pinnedWorkspaceId } from "@/lib/tenant";
import { token } from "../../_shared";

// The first right code turns the factor on. The back office opens a new session (code-checked) and closes
// the others opened without one: this one's tokens are replaced, or the member would be signed out.
export async function POST(request: Request) {
  try {
    const t = await token();
    const body = await readJson<{ factorId?: unknown; code?: unknown }>(request);
    const code = totpCode(body.code);
    if (typeof body.factorId !== "string" || !code) return apiError("Le code compte 6 chiffres.", 400, "invalid_code");
    const { session, factor } = await backoffice.mfaVerifyEnrollment(t, body.factorId, code);
    await writeSession(session);
    const workspace = await pinnedWorkspaceId();
    if (workspace) forgetSession(workspace, t);
    return noStore({ factor });
  } catch (e) {
    if (e instanceof BackofficeError && e.status === 422) return apiError("Code incorrect. Vérifiez l’heure de votre téléphone, puis réessayez.", 422, "mfa_code_invalid");
    return handleError(e);
  }
}
