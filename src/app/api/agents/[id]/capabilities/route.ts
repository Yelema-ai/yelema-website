import { requireAgentAccess } from "@/lib/auth";
import { handleError, json } from "@/lib/http";
import { runtimeCapabilities } from "@/lib/runtime-capabilities";

type Ctx = { params: Promise<{ id: string }> };

// What this instance's runtime offers, so the workspace hides what it cannot serve. Without the
// runtime gateway every instance is Hermes: everything is offered.
export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    await requireAgentAccess(id);
    const caps = await runtimeCapabilities(id);
    return json({ runtime: caps?.runtime ?? "hermes", hermesTools: caps ? caps.capabilities.includes("hermesTools") : true, telegramRelay: caps?.capabilities.includes("telegramRelay") ?? false });
  } catch (e) {
    return handleError(e);
  }
}
