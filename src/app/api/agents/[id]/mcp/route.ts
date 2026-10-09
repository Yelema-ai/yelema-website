import { requireAgentAccess } from "@/lib/auth";
import { handleError, json, ApiError } from "@/lib/http";
import { listInstanceMcpServers, addInstanceMcpServer, removeInstanceMcpServer } from "@/lib/mcp";

export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    await requireAgentAccess(id, "member");

    const servers = await listInstanceMcpServers(id);
    return json({ servers });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    await requireAgentAccess(id, "member");

    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      transport?: "HTTP/SSE" | "Stdio";
      url?: string;
      authType?: "none" | "bearer" | "oauth";
      token?: string;
      apiKey?: string;
    };

    if (!body.name || typeof body.name !== "string") {
      throw new ApiError(400, "invalid_name", "Le nom du serveur MCP est requis.");
    }
    if (!body.url || typeof body.url !== "string") {
      throw new ApiError(400, "invalid_url", "L'URL du serveur MCP est requise.");
    }

    const authType = body.authType || (body.token || body.apiKey ? "bearer" : "none");
    const token = body.token || body.apiKey || "";

    const server = await addInstanceMcpServer(id, {
      name: body.name,
      transport: body.transport,
      url: body.url,
      authType,
      token,
    });

    return json({ server }, 201);
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    await requireAgentAccess(id, "member");

    const { searchParams } = new URL(request.url);
    let name = searchParams.get("name");
    if (!name) {
      const body = (await request.json().catch(() => ({}))) as { name?: string };
      name = body.name || null;
    }

    if (!name) {
      throw new ApiError(400, "invalid_request", "Le nom du serveur MCP à supprimer est requis.");
    }

    await removeInstanceMcpServer(id, name);
    return json({ success: true, name });
  } catch (e) {
    return handleError(e);
  }
}
