import { backoffice } from "@/lib/backoffice";
import { mcpError, noStore, scopeToken, serverDraft } from "../_shared";

// `POST /api/mcp/client` — a tool server for the whole company, added by an admin. The back office
// checks it, keeps its token and writes it on the instances; the app passes it on and writes nothing.
export async function POST(request: Request) {
  try {
    return noStore(await backoffice.addMcpServer(await scopeToken({ kind: "client" }), { kind: "client" }, await serverDraft(request)));
  } catch (e) {
    return mcpError(e);
  }
}
