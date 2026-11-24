import { agent37 } from "@/lib/agent37";
import { requireChannelWrite } from "@/lib/auth";
import { handleError, json, readJson } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// `POST /api/agents/{id}/channels/telegram/hub/own`: the member's own BotFather bot, prepared like the Yelema
// one (group, one topic per expert). The token goes straight to the runtime gateway; nothing keeps it here.
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    await requireChannelWrite(id);
    const body = await readJson<{ token?: unknown }>(request).catch(() => ({}) as { token?: unknown });
    const token = typeof body.token === "string" ? body.token.trim().slice(0, 200) : "";
    return json(await agent37.telegramHub.own(id, token));
  } catch (e) {
    return handleError(e);
  }
}
