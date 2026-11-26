import { backoffice } from "@/lib/backoffice";
import { apiError, json, noStore, readJson } from "@/lib/http";
import { dropMfaTicket, readMfaTicket } from "@/lib/mfa-cookie";
import { codeRefusal, MFA_EXPIRED, openingStep, totpCode } from "@/lib/signin-steps";
import { answerOpening, authFailure, notEnabled, requestHost, tooManyTries } from "../_shared";

// The sign-in's second step. The ticket stays in its sealed cookie: the page only says whether one is waiting and sends the code.
export async function GET(request: Request) {
  const off = notEnabled();
  if (off) return off;
  return noStore({ pending: Boolean(await readMfaTicket(requestHost(request))) });
}

export async function POST(request: Request) {
  const off = notEnabled();
  if (off) return off;
  try {
    const ticket = await readMfaTicket(requestHost(request));
    if (!ticket) {
      await dropMfaTicket();
      return apiError(MFA_EXPIRED, 401, "mfa_ticket_invalid");
    }
    const code = totpCode((await readJson<{ code?: unknown }>(request)).code);
    if (!code) return apiError("Le code compte 6 chiffres.", 400, "invalid_code");
    const limited = tooManyTries("mfa", request, ticket);
    if (limited) return limited;

    const opening = await openingStep(() => backoffice.mfaSignIn(ticket, code));
    if (opening.kind !== "refused") return await answerOpening(opening, request);
    const refused = codeRefusal(opening.error);
    if (!refused) throw opening.error;
    if (refused.restart) await dropMfaTicket();
    return Response.json({ error: { code: refused.code, message: refused.message, ...(refused.attemptsLeft === undefined ? {} : { attemptsLeft: refused.attemptsLeft }) } }, { status: refused.status });
  } catch (e) {
    return authFailure(e);
  }
}

// « Retour à la connexion » : the waiting ticket is forgotten here (it dies at the back office within 5 minutes).
export async function DELETE() {
  const off = notEnabled();
  if (off) return off;
  await dropMfaTicket();
  return json({ ok: true });
}
