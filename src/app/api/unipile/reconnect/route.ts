import { backoffice } from "@/lib/backoffice";
import { ApiError, readJson } from "@/lib/http";
import { hostedLink, parseAccountId } from "@/lib/unipile";
import { noStore, settingsToken, unipileError } from "../_shared";

// `POST /api/unipile/reconnect` — un lien Unipile, fait par l'instance, pour relier à nouveau un compte en panne.
export async function POST(request: Request) {
  try {
    const accountId = parseAccountId(await readJson(request));
    if (!accountId) throw new ApiError(400, "bad_request", "Ce compte de messagerie n’est pas valide.");
    const url = hostedLink((await backoffice.reconnectUnipile(await settingsToken(), accountId)).url);
    if (!url) throw new ApiError(502, "instance_error", "Votre instance n’a pas pu traiter la demande. Réessayez dans un instant.");
    return noStore({ url });
  } catch (e) {
    return unipileError(e);
  }
}
