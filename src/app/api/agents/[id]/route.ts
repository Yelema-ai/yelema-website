import { requireAgentAccess } from "@/lib/auth";
import { ApiError, handleError, json, readJson } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { db } = await requireAgentAccess(id);

    const { name } = await readJson<{ name?: string }>(request);
    const trimmed = (name || "").trim();
    if (!trimmed) throw new ApiError(400, "invalid_request", "name is required");

    const { error } = await db.from("agents").update({ name: trimmed }).eq("agent37_id", id);
    if (error) throw new ApiError(500, "db_error", error.message);

    return json({ id, name: trimmed });
  } catch (e) {
    return handleError(e);
  }
}

// Agents are created and deleted by the Yelema back-office only (it also stops their billing).
export async function DELETE() {
  try {
    throw new ApiError(403, "forbidden", "Agents are managed by the Yelema back-office");
  } catch (e) {
    return handleError(e);
  }
}
