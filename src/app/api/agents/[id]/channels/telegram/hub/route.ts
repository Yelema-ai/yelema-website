import { agent37 } from "@/lib/agent37";
import { requireAgentAccess, requireChannelWrite } from "@/lib/auth";
import { handleError, json, readJson } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// Telegram of an instance (`/api/agents/{id}/channels/telegram/hub`): GET what the runtime gateway
// publishes, POST a t.me link that has the member create their own bot in one tap, DELETE to unplug it.
// The bot's token goes from Telegram to the instance through the runtime gateway, never through here.
// The bot is the whole instance's: on one several members share, only an admin sets it up or unplugs it.
export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    await requireAgentAccess(id);
    return json(await agent37.telegramHub.status(id));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { row } = await requireChannelWrite(id);
    const body = await readJson<{ name?: unknown }>(request).catch(() => ({}) as { name?: unknown });
    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 80) : (row.name ?? "Yelema");
    return json(await agent37.telegramHub.link(id, name));
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    await requireChannelWrite(id);
    return json(await agent37.telegramHub.disconnect(id));
  } catch (e) {
    return handleError(e);
  }
}
