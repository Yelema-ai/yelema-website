// Messaging channels: types shared by the BFF routes and the Canaux page.
//
// Channels live on the instance's default Hermes profile (the business chat): Hermes reports each
// channel's live state and the credentials it wants, and this app drives it over exec. Yelema offers
// two channels, Telegram (a bot) and WhatsApp (a QR pairing), each with its own flow.

// One credential a channel asks for, as the harness describes it.
export interface ChannelField {
  key: string;
  required: boolean;
  is_set: boolean;
  redacted_value: string | null;
  description: string | null;
  prompt: string | null;
  help: string | null;
  url: string | null;
  is_password: boolean;
  advanced: boolean;
}

// The harness's own shape for a channel (GET /api/messaging/platforms inside the instance).
export interface MessagingPlatform {
  id: string;
  name: string;
  description: string | null;
  docs_url: string | null;
  enabled: boolean;
  configured: boolean;
  gateway_running: boolean;
  // "disabled" | "connected" | "starting" | "startup_failed" and so on, the harness's own wording.
  state: string | null;
  error_code: string | null;
  error_message: string | null;
  home_channel: string | null;
  env_vars: ChannelField[];
}

export interface ChannelsResponse {
  channels: MessagingPlatform[];
}

// The channels Yelema offers, in display order.
export const SUPPORTED_CHANNELS = ["telegram", "whatsapp"] as const;
export type ChannelId = (typeof SUPPORTED_CHANNELS)[number];

export function isSupportedChannel(id: string): id is ChannelId {
  return (SUPPORTED_CHANNELS as readonly string[]).includes(id);
}

// A channel is live when the harness says the gateway has it connected.
export function isChannelConnected(channel: MessagingPlatform): boolean {
  return channel.enabled && channel.state === "connected";
}

// The harness keeps the last failure on a channel even after it is switched off, so an error only
// counts while the channel is actually meant to be running.
export function channelError(channel: MessagingPlatform): string | null {
  return channel.enabled ? channel.error_message : null;
}

export function channelStateLabel(channel: MessagingPlatform): string {
  if (isChannelConnected(channel)) return "Connecté";
  if (channelError(channel)) return "À vérifier";
  if (channel.enabled) return "Démarrage…";
  return "Non connecté";
}

// ---- Telegram ----

// What a pasted BotFather token turns out to be. Validated against Telegram before it is written
// into the agent, so a typo never takes the messaging gateway down.
export interface TelegramBotCheck {
  username: string;
  name: string | null;
}

// The owner Telegram picked up from the first message sent to their bot, or null while nobody has
// written to it yet.
export interface TelegramOwner {
  user_id: string;
  name: string | null;
}

// POST /api/agents/[id]/channels/telegram/topics: `message` is the French line for the page,
// `output` the tail of what the instance printed (for support).
export interface TelegramTopicsResult {
  ok: boolean;
  message: string;
  output: string;
}

// ---- WhatsApp ----

export type WhatsappPairingStatus =
  | "installing"
  | "starting"
  | "waiting"
  | "connected"
  | "error"
  | "expired"
  | "cancelled";

// The harness's pairing record, relayed as-is by the BFF (plus a rendered QR).
export interface WhatsappPairing {
  pairing_id?: string;
  status?: WhatsappPairingStatus;
  qr_payload?: string | null;
  account_phone?: string | null;
  error?: string | null;
}

// What the WhatsApp panel sees. `linking` is ours: a scan has landed and the agent is still saving
// it, so the screen stops asking for a code it already got.
export type WhatsappUiStatus = "preparing" | "waiting" | "linking" | "connected" | "expired";

export interface WhatsappPairingState {
  pairing_id: string;
  status: WhatsappUiStatus;
  qr_data_url?: string;
  phone?: string | null;
}
