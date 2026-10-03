import { requireAgentAccess } from "@/lib/auth";
import { handleError, json } from "@/lib/http";
import { listPlatforms } from "@/lib/hermes-messaging";
import { SUPPORTED_CHANNELS } from "@/lib/channels";
import type { ChannelsResponse, MessagingPlatform } from "@/lib/channels";

// Slow by nature: this is one exec into the instance, and a sleeping agent is woken first.
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

// The channels Yelema offers (Telegram, WhatsApp) with their live state on the default profile.
export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    await requireAgentAccess(id, "member");

    const platforms = await listPlatforms(id);
    const channels = SUPPORTED_CHANNELS.map((key) => platforms.find((p) => p.id === key)).filter(
      (p): p is MessagingPlatform => Boolean(p)
    );
    return json<ChannelsResponse>({ channels });
  } catch (e) {
    return handleError(e);
  }
}
