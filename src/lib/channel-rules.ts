import type { ChannelField, MessagingPlatform } from "./channels.ts";

// Rules every messaging channel obeys before anything is written into the agent. Pure, so the form and
// the BFF route agree on what is asked for and what is refused.

// Fields this app never writes: "allow everyone" would empty the allowlist's meaning, Teams listens on
// the port the back office opened, and Google Chat receives over Pub/Sub, never by an HTTP callback.
const NEVER_WRITTEN = [/_ALLOW_ALL_USERS$/, /^TEAMS_(PORT|HOST)$/, /^GOOGLE_CHAT_HTTP_EVENTS_/];

export function isWritableField(key: string): boolean {
  return !NEVER_WRITTEN.some((re) => re.test(key));
}

export function isAllowlistField(key: string): boolean {
  return key.endsWith("_ALLOWED_USERS");
}

// What one allowed person looks like on each channel, as the harness compares it.
const ALLOWED_ID: Record<string, { re: RegExp; what: string }> = {
  telegram: { re: /^\d{3,20}$/, what: "des identifiants Telegram (des chiffres)" },
  teams: { re: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, what: "des identifiants d’objet Microsoft Entra (au format 8-4-4-4-12)" },
  slack: { re: /^[UW][A-Z0-9]{6,}$/, what: "des identifiants de membre Slack (qui commencent par U ou W)" },
  discord: { re: /^\d{15,21}$/, what: "des identifiants d’utilisateur Discord (des chiffres)" },
  google_chat: { re: /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/, what: "des adresses e-mail" },
};

/** The allowlist as the harness wants it: comma-separated, no blanks, no duplicates. */
export function normalizeAllowlist(raw: string): string {
  return [...new Set(raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean))].join(",");
}

export interface ChannelWrite {
  env: Record<string, string>;
  // French, for the page; null when the write may go ahead.
  problem: string | null;
}

/**
 * The credentials to write, out of what the browser sent: unknown and never-written keys dropped,
 * values trimmed, the allowlist normalized. An untouched secret arrives absent, not blank, and is left
 * alone. Turning a channel on needs every required field and a non-empty allowlist.
 */
export function prepareChannelWrite(platform: MessagingPlatform, sent: Record<string, unknown> | undefined, enabling: boolean): ChannelWrite {
  const env: Record<string, string> = {};
  for (const field of platform.env_vars) {
    const value = sent?.[field.key];
    if (typeof value !== "string" || !isWritableField(field.key)) continue;
    env[field.key] = isAllowlistField(field.key) ? normalizeAllowlist(value) : value.trim();
  }
  if (!enabling) return { env, problem: null };

  const missing = platform.env_vars.filter((f) => f.required && isWritableField(f.key) && !(f.key in env ? env[f.key] : f.is_set));
  if (missing.length > 0) return { env, problem: `À renseigner : ${missing.map(fieldLabel).join(", ")}.` };

  const allowlist = platform.env_vars.find((f) => isAllowlistField(f.key));
  if (allowlist) {
    const value = allowlist.key in env ? env[allowlist.key] : null;
    if (value === "" || (value === null && !allowlist.is_set)) {
      return { env, problem: "Indiquez au moins une personne autorisée : sans cette liste, quiconque trouve le bot parlerait à vos Experts." };
    }
    const format = ALLOWED_ID[platform.id];
    const bad = value?.split(",").filter((id) => format && !format.re.test(id)) ?? [];
    if (format && bad.length > 0) return { env, problem: `Personnes autorisées : « ${bad[0]} » ne convient pas. Il faut ${format.what}.` };
  }
  return { env, problem: null };
}

export function fieldLabel(field: ChannelField): string {
  return field.prompt || field.key;
}
