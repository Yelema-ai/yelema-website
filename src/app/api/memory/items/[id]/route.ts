import { backoffice } from "@/lib/backoffice";
import { handleError, json, readJson } from "@/lib/http";
import type { MemoryPatch } from "@/lib/memory";
import { mailToken as sessionToken, noStore } from "../../../mail/_session";

// `PATCH` / `DELETE /api/memory/items/{id}` — changes or removes a deposit; removing it erases it
// from the experts' memory too.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { title, note, description, unit, active } = await readJson<MemoryPatch>(request);
    return noStore(json(await backoffice.updateMemoryItem(await sessionToken(), (await params).id, { title, note, description, unit, active })));
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return noStore(json(await backoffice.deleteMemoryItem(await sessionToken(), (await params).id)));
  } catch (e) {
    return handleError(e);
  }
}
