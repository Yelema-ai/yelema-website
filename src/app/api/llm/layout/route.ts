import { backoffice } from "@/lib/backoffice";
import { ApiError, readJson } from "@/lib/http";
import { parseLayout, parseScopeParam, scopeParam } from "@/lib/llm-accounts";
import { noStore, scopeToken, settingsError } from "../_shared";

// `PUT /api/llm/layout?scope=` — the order of providers and accounts after a drag, with each provider's
// model and backup models.
export async function PUT(request: Request) {
  try {
    const scope = parseScopeParam(new URL(request.url).searchParams.get("scope"));
    const layout = parseLayout(await readJson(request));
    if (!scope || !layout) throw new ApiError(400, "bad_request", "Cette demande n’a pas pu être traitée.");
    return noStore(await backoffice.setLlmLayout(await scopeToken(scope), scopeParam(scope)!, layout));
  } catch (e) {
    return settingsError(e);
  }
}
