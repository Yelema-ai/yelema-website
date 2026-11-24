import { backoffice } from "@/lib/backoffice";
import { ApiError, readJson } from "@/lib/http";
import { parseAccountDraft, parseScopeParam, scopeParam } from "@/lib/llm-accounts";
import { noStore, scopeToken, settingsError } from "../_shared";

// `POST /api/llm/accounts?scope=own|<member>` — one more model account: a key, a pasted
// subscription token, a private endpoint or a sign-in. The back office checks and keeps it.
export async function POST(request: Request) {
  try {
    const scope = parseScopeParam(new URL(request.url).searchParams.get("scope"));
    const draft = parseAccountDraft(await readJson(request));
    if (!scope || !draft) throw new ApiError(400, "bad_request", "Cette demande n’a pas pu être traitée.");
    return noStore(await backoffice.addLlmAccount(await scopeToken(scope), scopeParam(scope)!, draft));
  } catch (e) {
    return settingsError(e);
  }
}
