import { ApiError, readJson } from "@/lib/http";
import { mcpRefusalMessage, parseServerDraft, type McpServerDraft } from "@/lib/mcp-servers";
import { settingsError } from "../llm/_shared";

export { noStore, scopeToken, settingsToken } from "../llm/_shared";

export async function serverDraft(request: Request): Promise<McpServerDraft> {
  const draft = parseServerDraft(await readJson(request));
  if (!draft) throw new ApiError(400, "bad_request", "Cette demande n’a pas pu être traitée.");
  return draft;
}

// A refusal of the back office reaches the member as a sentence written in src/lib/mcp-servers.ts.
export const mcpError = (e: unknown) => settingsError(e, mcpRefusalMessage);
