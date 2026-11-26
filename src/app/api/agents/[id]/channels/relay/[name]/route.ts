import { agent37, type RelayChannel } from "@/lib/agent37";
import { requireAgentAccess, requireChannelWrite } from "@/lib/auth";
import { relayUnlinkIsShared } from "@/lib/channel-rules";
import { ApiError, handleError, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string; name: string }> };

// Slack and Teams of a Claude Code instance, and the relayed Telegram of a team member (`/api/agents/{id}/channels/relay/{slack|teams}`): GET how many
// accounts are linked, POST a link code (and the Slack install link), DELETE to unlink every account.
// Linking is each member's own account. Unlinking Slack or Teams drops every member's: an admin's, on a shared instance.
async function target(params: Ctx["params"], unlink = false): Promise<{ id: string; channel: RelayChannel }> {
  const { id, name } = await params;
  if (name !== "slack" && name !== "teams" && name !== "telegram") throw new ApiError(404, "not_found", "Ce canal n’existe pas.");
  await (unlink && relayUnlinkIsShared(name) ? requireChannelWrite(id) : requireAgentAccess(id));
  return { id, channel: name };
}

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id, channel } = await target(params);
    return json(await agent37.channelRelay.status(id, channel));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(_request: Request, { params }: Ctx) {
  try {
    const { id, channel } = await target(params);
    return json(await agent37.channelRelay.link(id, channel));
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { id, channel } = await target(params, true);
    return json(await agent37.channelRelay.unlink(id, channel));
  } catch (e) {
    return handleError(e);
  }
}
