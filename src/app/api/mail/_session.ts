import { ApiError } from "@/lib/http";
import { authViaBackoffice } from "@/lib/runtime-config";
import { readSession } from "@/lib/session";

// The experts' e-mail is the back office's: these routes only relay, with the member's own session.
// Who may read or send is decided there on every call, never here.
export async function mailToken(): Promise<string> {
  if (!authViaBackoffice()) throw new ApiError(404, "not_found", "Les e-mails des experts ne sont pas disponibles.");
  const session = await readSession();
  if (!session) throw new ApiError(401, "unauthorized", "Connectez-vous pour continuer.");
  return session.accessToken;
}

export function noStore<T extends Response>(res: T): T {
  res.headers.set("Cache-Control", "no-store");
  return res;
}
