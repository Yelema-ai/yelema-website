import { backoffice } from "@/lib/backoffice";
import { mcpError, noStore, scopeToken, serverDraft } from "../../_shared";

type Ctx = { params: Promise<{ memberId: string }> };

// `POST /api/mcp/members/{memberId}` — a tool server for one member, added by an admin. The back
// office answers 404 to anyone else, and to an id that is not a member of this workspace.
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { memberId } = await params;
    const scope = { kind: "member", id: memberId } as const;
    return noStore(await backoffice.addMcpServer(await scopeToken(scope), scope, await serverDraft(request)));
  } catch (e) {
    return mcpError(e);
  }
}
