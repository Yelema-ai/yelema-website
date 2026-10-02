import { agent37 } from "@/lib/agent37";
import { templateAppPorts } from "@/config/agents";
import { requireAgentAccess } from "@/lib/auth";
import { ApiError, handleError, json, readJson } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    await requireAgentAccess(id);

    const { port, ttl_seconds } = await readJson<{ port?: number; ttl_seconds?: number }>(request);
    if (!port) throw new ApiError(400, "invalid_request", "port is required");

    // A member must not open an arbitrary internal port. Older API versions reported the
    // instance's open ports — honor those when present; current ones return null, so fall
    // back to the template's documented app ports.
    const inst = await agent37.getAgent(id);
    const openable = inst.ports?.length
      ? inst.ports.map((p) => p.port)
      : templateAppPorts(inst.template);
    if (!openable.includes(port)) {
      throw new ApiError(400, "invalid_request", "port is not openable");
    }

    // With a custom domain registered, Agent37 also returns the link under it: hand that one out,
    // so users see the Yelema domain rather than agent37.app.
    const result = await agent37.signedUrl(id, port, ttl_seconds);
    return json({ ...result, url: result.domain_urls?.[0] ?? result.url });
  } catch (e) {
    return handleError(e);
  }
}
