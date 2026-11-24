import "server-only";
import { randomBytes } from "node:crypto";
import { agent37, instanceFetch } from "@/lib/agent37";
import { ApiError } from "@/lib/http";
import { memo } from "@/lib/memo";
import type { MessagingPlatform, TelegramPairing, WhatsappPairing } from "@/lib/channels";
import { OUTPUT_MARKER, script } from "@/lib/hermes-script";

// Hermes serves its own messaging API on a LOOPBACK port inside the instance (9119), so it is
// reachable only from inside the sandbox, which is exactly what POST /v1/instances/{id}/exec gives
// us (https://www.agent37.com/docs/agents-api/exec). Every call below is one exec that curls the
// in-sandbox API and prints the JSON back.
//
// Its session token is minted per dashboard start and injected into that SPA's HTML, so each call
// scrapes it first. That is Hermes's own auth, not ours: this app's own auth already happened in the
// BFF route before we got here.
const UNAVAILABLE = "Les canaux de vos Experts ne répondent pas pour le moment. Réessayez dans un instant.";

// A body is written to the instance first (0600, removed by the command that reads it): the exec's command line is
// what its logs and `ps` keep. CHANNEL_BODY_IN_COMMAND=on restores the body in the command.
async function stageBody(agentId: string, body: unknown): Promise<string | undefined> {
  if (process.env.CHANNEL_BODY_IN_COMMAND === "on") return undefined;
  const name = `.yelema/.channel-${randomBytes(12).toString("hex")}.json`;
  const res = await instanceFetch(agentId, `/v1/files/content?${new URLSearchParams({ path: `~/${name}`, overwrite: "true" }).toString()}`, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream" },
    body: JSON.stringify(body),
  });
  await res.body?.cancel().catch(() => undefined);
  if (!res.ok) {
    console.error(`[channels] body upload failed on ${agentId}: ${res.status}`);
    throw new ApiError(502, "channel_unavailable", UNAVAILABLE);
  }
  return `$HOME/${name}`;
}

// Run one call against the instance's own messaging API. Throws ApiError when the sandbox could not
// be reached or answered with something that is not JSON. The caller's channel UI shows that as
// "try again", which is the honest reading of a gateway that is still booting.
// `secret`: the body carries credentials (a channel write) and goes by file.
async function dashboard<T>(agentId: string, method: string, path: string, body?: unknown, secret = false): Promise<T> {
  const result = await agent37.exec(agentId, script(method, path, body, secret ? await stageBody(agentId, body) : undefined));
  const marked = result.stdout.indexOf(OUTPUT_MARKER);
  if (marked < 0) {
    console.error(`[channels] ${method} ${path} failed on ${agentId}`, result.stderr || result.stdout);
    throw new ApiError(502, "channel_unavailable", UNAVAILABLE);
  }
  try {
    return JSON.parse(result.stdout.slice(marked + OUTPUT_MARKER.length).trim()) as T;
  } catch {
    console.error(`[channels] ${method} ${path} returned no JSON on ${agentId}`, result.stdout.slice(marked, marked + 500));
    throw new ApiError(502, "channel_unavailable", UNAVAILABLE);
  }
}

interface PlatformsResponse {
  platforms: MessagingPlatform[];
}

// One exec answers both: the channels the harness offers (fixed for an image version) and their
// live state. The whole answer is kept 30 s per instance and dropped on every write; the catalogue
// alone is kept per image, so the screen lists the channels before the state is in.
const platforms = memo<MessagingPlatform[]>({ ttlMs: 30_000, maxEntries: 2000, maxFlightMs: 130_000 });
const catalogues = memo<MessagingPlatform[]>({ ttlMs: 24 * 60 * 60_000, maxEntries: 200 });

// Every channel the agent's harness supports, with its live state and the credentials it wants.
// The harness is the catalog: this app never hardcodes the field list, so a channel the harness
// adds shows up here on its own. `imageKey` (template:revision) files the catalogue under its image.
export async function listPlatforms(agentId: string, imageKey = ""): Promise<MessagingPlatform[]> {
  const list = await platforms.get(agentId, async () => (await dashboard<PlatformsResponse>(agentId, "GET", "/api/messaging/platforms")).platforms ?? []);
  if (imageKey) catalogues.put(imageKey, list.map(withoutState));
  return list;
}

/** The channels an image offers, without any state; undefined until one instance of it was read. */
export function knownCatalogue(imageKey: string): MessagingPlatform[] | undefined {
  return imageKey ? catalogues.peek(imageKey) : undefined;
}

/** After a write: the next reading asks the instance again. */
export function forgetPlatforms(agentId: string): void {
  platforms.drop(agentId);
}

const withoutState = (p: MessagingPlatform): MessagingPlatform => ({ ...p, enabled: false, configured: false, gateway_running: false, state: null, error_code: null, error_message: null, home_channel: null });

export async function getPlatform(agentId: string, platformId: string): Promise<MessagingPlatform> {
  const platform = (await listPlatforms(agentId)).find((p) => p.id === platformId);
  if (!platform) throw new ApiError(404, "not_found", "Ce canal n’est pas disponible.");
  return platform;
}

interface PlatformUpdateResponse {
  ok?: boolean;
  // false when the change needs a gateway restart to take effect.
  hot_served?: boolean;
  detail?: string;
}

// Write a channel's credentials and switch it on (or off). A change the running gateway cannot pick
// up live comes back `hot_served: false`, and then the restart is what actually connects it.
export async function writePlatform(
  agentId: string,
  platformId: string,
  update: { enabled?: boolean; env?: Record<string, string>; clear_env?: string[] }
): Promise<void> {
  forgetPlatforms(agentId);
  const result = await dashboard<PlatformUpdateResponse>(
    agentId,
    "PUT",
    `/api/messaging/platforms/${encodeURIComponent(platformId)}`,
    update,
    true
  );
  if (result.ok !== true) {
    console.error(`[channels] ${platformId} refused on ${agentId}`, result.detail);
    throw new ApiError(502, "channel_write_failed", "Ce canal n’a pas pu être enregistré. Vérifiez les informations saisies, puis réessayez.");
  }
  if (result.hot_served !== true) await dashboard(agentId, "POST", "/api/gateway/restart");
  forgetPlatforms(agentId);
}

// ---- WhatsApp: a QR pairing, not a credential ----
// WhatsApp links a phone rather than taking a token, so the harness runs the pairing itself and we
// relay it: start opens the socket, the poll republishes the rotating code, and apply saves the
// linked number as the allowlist once a scan lands.

const WHATSAPP_ONBOARDING = "/api/messaging/whatsapp/onboarding";

export function startWhatsappPairing(agentId: string): Promise<WhatsappPairing> {
  return dashboard<WhatsappPairing>(agentId, "POST", `${WHATSAPP_ONBOARDING}/start`, { mode: "self-chat" });
}

export function readWhatsappPairing(agentId: string, pairingId: string): Promise<WhatsappPairing> {
  return dashboard<WhatsappPairing>(agentId, "GET", `${WHATSAPP_ONBOARDING}/${encodeURIComponent(pairingId)}`);
}

export function applyWhatsappPairing(agentId: string, pairingId: string): Promise<{ ok?: boolean; detail?: string }> {
  forgetPlatforms(agentId);
  return dashboard(agentId, "POST", `${WHATSAPP_ONBOARDING}/${encodeURIComponent(pairingId)}/apply`, {});
}

// ---- Telegram: a managed bot created by scanning a QR ----
// The harness asks its setup service for a pairing; the user scans it in Telegram, which creates a bot
// they own; apply saves that bot's token and its owner as the allowlist, then restarts the gateway.
// The token stays inside the agent: this app only ever sees the bot's @username and its owner's id.

const TELEGRAM_ONBOARDING = "/api/messaging/telegram/onboarding";

export function startTelegramPairing(agentId: string, botName: string): Promise<TelegramPairing> {
  return dashboard<TelegramPairing>(agentId, "POST", `${TELEGRAM_ONBOARDING}/start`, { bot_name: botName });
}

export function readTelegramPairing(agentId: string, pairingId: string): Promise<TelegramPairing> {
  return dashboard<TelegramPairing>(agentId, "GET", `${TELEGRAM_ONBOARDING}/${encodeURIComponent(pairingId)}`);
}

export function applyTelegramPairing(
  agentId: string,
  pairingId: string,
  allowedUserIds: string[]
): Promise<{ ok?: boolean; detail?: string; bot_username?: string | null }> {
  forgetPlatforms(agentId);
  return dashboard(agentId, "POST", `${TELEGRAM_ONBOARDING}/${encodeURIComponent(pairingId)}/apply`, {
    allowed_user_ids: allowedUserIds,
  });
}
