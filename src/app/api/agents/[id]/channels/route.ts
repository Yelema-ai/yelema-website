import { requireAgentAccess } from "@/lib/auth";
import { handleError, json } from "@/lib/http";
import { knownCatalogue, listPlatforms } from "@/lib/hermes-messaging";
import { imageKeyOf, servesHermesTools } from "@/lib/runtime-capabilities";
import { isConnectableChannel, sortChannels } from "@/lib/channels";
import type { ChannelsResponse, MessagingPlatform } from "@/lib/channels";
import { currentInstance } from "@/lib/session";

// Slow by nature: this is one exec into the instance, and a sleeping agent is woken first.
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

// Every messaging channel this agent supports, with its live state and the credentials it wants.
// `?view=catalogue`: the channels its image offers, without state, when already known (no exec);
// `state: "unknown"` then says the live state is still to be read. A non-Hermes runtime has none.
export async function GET(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    await requireAgentAccess(id);
    const catalogueOnly = new URL(request.url).searchParams.get("view") === "catalogue";

    const [hermes, imageKey, instance] = await Promise.all([servesHermesTools(id).catch(() => true), imageKeyOf(id), currentInstance().catch(() => null)]);
    // The address to give Microsoft: the back office opened it on this instance (the member's own).
    const teams_endpoint = instance?.id === id ? (instance.channels?.teams?.endpoint ?? null) : null;
    if (!hermes) return json<ChannelsResponse & { hermesTools: false }>({ channels: [], teams_endpoint, hermesTools: false });
    const known = catalogueOnly ? knownCatalogue(imageKey) : undefined;
    if (catalogueOnly && !known) return json({ channels: null, teams_endpoint, state: "unknown" });
    const platforms = known ?? (await listPlatforms(id, imageKey));
    const response: ChannelsResponse = { channels: sortChannels(platforms).filter(isConnectableChannel).map(rebrand), teams_endpoint };
    return json(known ? { ...response, state: "unknown" } : response);
  } catch (e) {
    return handleError(e);
  }
}

// The harness describes its channels in English. A member reads none of it (Leslie, 06/11: « encore de
// l'anglais » under Telegram): a channel with a French line here gets it, any other gets none.
const CHANNEL_DESCRIPTIONS: Record<string, string> = {
  telegram: "Écrivez à vos Experts depuis Telegram, en message privé ou dans un groupe avec un sujet par Expert.",
  whatsapp: "Écrivez à vos Experts depuis WhatsApp.",
  teams: "Écrivez à vos Experts depuis Microsoft Teams, en message privé ou dans vos équipes.",
  slack: "Écrivez à vos Experts depuis Slack, en message privé ou dans vos canaux.",
  discord: "Écrivez à vos Experts depuis Discord, en message privé ou sur vos serveurs.",
  google_chat: "Écrivez à vos Experts depuis Google Chat, en message privé ou dans vos espaces.",
};

function rebrand(channel: MessagingPlatform): MessagingPlatform {
  return {
    ...channel,
    description: CHANNEL_DESCRIPTIONS[channel.id] ?? null,
    // The fields' own help is English too: the panels write their own French hints.
    env_vars: channel.env_vars.map((field) => ({ ...field, description: null, help: null })),
  };
}
