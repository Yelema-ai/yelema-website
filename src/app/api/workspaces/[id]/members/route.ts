import { requireMember, requireUser } from "@/lib/auth";
import { backoffice, BackofficeError } from "@/lib/backoffice";
import { ApiError, handleError, json, dbError } from "@/lib/http";
import { authViaBackoffice } from "@/lib/runtime-config";
import { currentPrincipal, readSession } from "@/lib/session";
import type { Invitation, Role, WorkspaceMember } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { db, user } = await requireUser();
    const role = await requireMember(db, id, user.id);

    if (authViaBackoffice()) return json({ members: await backofficeMembers(role), invitations: [], role });

    const { data: members, error } = await db.rpc("get_workspace_members", { p_workspace: id });
    if (error) throw dbError(error);

    let invitations: Invitation[] = [];
    if (role === "admin") {
      const { data: inv } = await db
        .from("invitations")
        .select("*")
        .eq("workspace_id", id)
        .order("created_at", { ascending: false });
      invitations = (inv as Invitation[]) ?? [];
    }

    return json({ members: (members as WorkspaceMember[]) ?? [], invitations, role });
  } catch (e) {
    return handleError(e);
  }
}

// The members as the back office lists them. Only an admin gets the list; a member sees their own
// line, which is all the back office would tell them.
async function backofficeMembers(role: Role): Promise<WorkspaceMember[]> {
  const [session, me] = await Promise.all([readSession(), currentPrincipal()]);
  if (!session || !me) return [];
  if (role !== "admin") {
    return [{ user_id: me.user.id, email: me.user.email, name: me.user.name, role: me.user.role, created_at: null }];
  }
  try {
    return (await backoffice.members(session.accessToken)).map((m) => ({
      user_id: m.email,
      email: m.email,
      name: m.name,
      role: m.role,
      status: m.status,
      instance_name: m.instance?.name ?? null,
      created_at: m.instance?.createdAt ?? null,
    }));
  } catch (e) {
    if (e instanceof BackofficeError) throw new ApiError(e.status, e.code, e.message);
    throw e;
  }
}

// Invitations are disabled: the Yelema back-office creates every member and their agent.
export async function POST() {
  try {
    throw new ApiError(403, "forbidden", "Les membres sont gérés par Yelema.");
  } catch (e) {
    return handleError(e);
  }
}
