import { requireAdmin, requireUser } from "@/lib/auth";
import { ApiError, handleError, json, readJson } from "@/lib/http";
import type { Workspace } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { db, user } = await requireUser();
    await requireAdmin(db, id, user.id);

    const { name } = await readJson<{ name?: string }>(request);
    const trimmed = (name || "").trim();
    if (!trimmed) throw new ApiError(400, "invalid_request", "Workspace name is required");

    const { data, error } = await db
      .from("workspaces")
      .update({ name: trimmed })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new ApiError(500, "db_error", error.message);

    return json({ workspace: data as Workspace });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE() {
  try {
    await requireUser();
    // One client per deployment: the workspace is created and owned by the Yelema back-office.
    throw new ApiError(403, "forbidden", "Workspaces are managed by the back-office");
  } catch (e) {
    return handleError(e);
  }
}
