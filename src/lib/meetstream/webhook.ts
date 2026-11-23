import { createHmac, timingSafeEqual } from "node:crypto";

export const WEBHOOK_MAX_BYTES = 256 * 1024;
export const SIGNATURE_HEADER = "x-meetstream-signature";

const SIGNATURE = /^sha256=([0-9a-f]{64})$/i;

export function signatureMatches(rawBody: string, header: string | null, secret: string): boolean {
  if (!secret) return false;
  const given = SIGNATURE.exec(header?.trim() ?? "")?.[1];
  if (!given) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  const received = Buffer.from(given, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export interface WebhookEvent {
  event: string;
  botId: string;
  attributes: Record<string, string>;
}

export function parseWebhookEvent(rawBody: string): WebhookEvent | null {
  let data: unknown;
  try {
    data = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  const event = typeof d.bot_event === "string" ? d.bot_event : typeof d.event === "string" ? d.event : null;
  if (!event || typeof d.bot_id !== "string") return null;
  const raw = d.custom_attributes;
  const attributes =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? Object.fromEntries(Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === "string"))
      : {};
  return { event, botId: d.bot_id, attributes };
}
