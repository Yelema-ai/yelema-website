import { backoffice } from "@/lib/backoffice";
import { ApiError } from "@/lib/http";
import { parseScopeParam, scopeParam } from "@/lib/llm-accounts";
import { isProviderParam } from "@/lib/model-options";
import { noStore, scopeToken, settingsError } from "../_shared";

// `GET /api/llm/models?scope=[&provider=]` — the models a picker offers, grouped by provider: those
// of the connected accounts and Yelema's, or one provider's list for the add dialog.
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const scope = parseScopeParam(params.get("scope"));
    const provider = params.get("provider");
    if (!scope || (provider !== null && !isProviderParam(provider))) throw new ApiError(400, "bad_request", "Cette demande n’a pas pu être traitée.");
    return noStore(await backoffice.llmModels(await scopeToken(scope), scopeParam(scope)!, provider ?? undefined));
  } catch (e) {
    return settingsError(e);
  }
}
