import { backoffice } from "@/lib/backoffice";
import { ApiError, readJson } from "@/lib/http";
import { isTriggerId, pickPatch, triggerRefusalMessage } from "@/lib/triggers";
import { noStore, settingsError, settingsToken } from "../../llm/_shared";

// `PATCH|DELETE /api/triggers/{id}` — un de ses déclencheurs ; source, expert et délai ne changent pas.
type Ctx = { params: Promise<{ triggerId: string }> };

async function triggerId(ctx: Ctx): Promise<string> {
  const { triggerId: id } = await ctx.params;
  if (!isTriggerId(id)) throw new ApiError(404, "not_found", "Ce déclencheur n’existe plus.");
  return id;
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const id = await triggerId(ctx);
    const body = pickPatch(await readJson(request));
    if (!body) throw new ApiError(400, "bad_request", "Rien à modifier.");
    return noStore(await backoffice.updateTrigger(await settingsToken(), id, body));
  } catch (e) {
    return settingsError(e, triggerRefusalMessage);
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    return noStore(await backoffice.deleteTrigger(await settingsToken(), await triggerId(ctx)));
  } catch (e) {
    return settingsError(e, triggerRefusalMessage);
  }
}
