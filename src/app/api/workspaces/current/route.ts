import { cookies } from "next/headers";
import { requireMember, requireUser } from "@/lib/auth";
import { handleError, json, readJson } from "@/lib/http";
import { WORKSPACE_COOKIE } from "@/lib/workspace";

// "Changer d'espace": remember which of the user's workspaces the app shows.
export async function POST(request: Request) {
  try {
    const { db, user } = await requireUser();
    const { id } = await readJson<{ id?: string }>(request);
    await requireMember(db, id ?? "", user.id);
    (await cookies()).set(WORKSPACE_COOKIE, id!, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
    return json({ id });
  } catch (e) {
    return handleError(e);
  }
}
