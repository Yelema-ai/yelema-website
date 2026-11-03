import { backoffice } from "@/lib/backoffice";
import { apiError, json, readJson } from "@/lib/http";
import { authFailure, notEnabled } from "../_shared";

// "Recevoir une nouvelle invitation": an invited member whose link has expired asks for a fresh one.
// The back office finds who it was for from the old link and sends it; it answers the same either way.
export async function POST(request: Request) {
  const off = notEnabled();
  if (off) return off;
  try {
    const { tokenHash } = await readJson<{ tokenHash?: string }>(request);
    if (!tokenHash) return apiError("Ce lien n’est plus valable.", 400, "invalid_link");
    await backoffice.resendInvite(tokenHash);
    return json({ ok: true });
  } catch (e) {
    return authFailure(e);
  }
}
