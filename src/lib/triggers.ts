// Déclencheurs « quand… alors… » d'un expert (back-office `/app/triggers`, guide app.md). Pur : `node --test`.
import { accountState, accountTitle, accountsBySlug } from "./connection-accounts.ts";
import type { IntegrationConnection } from "./types";

export const TRIGGER_SOURCES = ["agentmail", "gmail", "outlook", "calendar", "unipile", "webhook"] as const;
export type TriggerSource = (typeof TRIGGER_SOURCES)[number];

export interface TriggerFilter {
  senders: string[];
  domains: string[];
  keywords: string[];
  leadMinutes: number | null;
}

export interface Trigger {
  id: string;
  expert: string;
  name: string;
  source: TriggerSource;
  enabled: boolean;
  instruction: string;
  filter: TriggerFilter;
  maxPerHour: number;
  lastFiredAt: string | null;
  /** gmail/outlook/calendar : le compte Composio écouté ; null = le premier actif. */
  accountId: string | null;
  webhookUrl: string | null;
  /** unipile : webhook créé par l'instance, rien à copier ni de clé rendue. */
  webhookSubscribed: boolean;
}

/** `key`: rendue une seule fois, à la création et après `rotateKey`. */
export type TriggerWithKey = Trigger & { key?: string };

export interface TriggersOverview {
  triggers: Trigger[];
  experts: string[];
  sources: TriggerSource[];
}

export const SOURCE_LABELS: Record<TriggerSource, string> = {
  agentmail: "Nouveau mail dans la boîte de l’expert",
  gmail: "Nouveau mail Gmail",
  outlook: "Nouveau mail Outlook",
  calendar: "Rendez-vous qui approche",
  unipile: "Nouveau message WhatsApp/LinkedIn",
  webhook: "Appel d’un autre logiciel (webhook)",
};

/** La clé à montrer une fois : jamais quand l'instance s'est abonnée elle-même. */
export const revealsKey = (t: TriggerWithKey): t is TriggerWithKey & { key: string } => !t.webhookSubscribed && typeof t.key === "string" && t.key.length > 0;

export const isTriggerSource = (v: unknown): v is TriggerSource => TRIGGER_SOURCES.includes(v as TriggerSource);
export const isMailSource = (s: TriggerSource): boolean => s === "agentmail" || s === "gmail" || s === "outlook";
export const hasKey = (s: TriggerSource): boolean => s === "unipile" || s === "webhook";

// Miroir de `COMPOSIO_TOOLKITS` du back-office : les sources qui écoutent un compte connecté.
const TOOLKITS: Partial<Record<TriggerSource, string>> = { gmail: "gmail", outlook: "outlook", calendar: "googlecalendar" };
export const toolkitOf = (s: TriggerSource): string | null => TOOLKITS[s] ?? null;

export interface TriggerAccount {
  id: string;
  title: string;
  isDefault: boolean;
}

/** Les comptes connectés et actifs que la source peut écouter, le compte par défaut d'abord. */
export function triggerAccounts(conns: readonly IntegrationConnection[], source: TriggerSource): TriggerAccount[] {
  const toolkit = toolkitOf(source);
  if (!toolkit) return [];
  const list = (accountsBySlug(conns).get(toolkit) ?? []).filter((c) => accountState(c) === "active");
  return list
    .map((c, i) => ({ id: c.id, title: accountTitle(c, i), isDefault: Boolean(c.isDefault) }))
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
}

/** Le nom du compte écouté par un déclencheur ; null s'il n'est plus dans la liste. */
export function accountNameOf(conns: readonly IntegrationConnection[], accountId: string | null): string | null {
  if (!accountId) return null;
  for (const list of accountsBySlug(conns).values()) {
    const i = list.findIndex((c) => c.id === accountId);
    if (i >= 0) return accountTitle(list[i], i);
  }
  return null;
}

/** Un seul compte : rien à envoyer, le back-office le prend. Plusieurs : le choix est obligatoire. */
export function accountChoice(accounts: readonly TriggerAccount[], chosen: string): { accountId?: string } | { error: string } {
  if (accounts.length < 2) return {};
  return accounts.some((a) => a.id === chosen) ? { accountId: chosen } : { error: "Choisissez le compte que l’expert doit écouter." };
}

export const MAX_INSTRUCTION = 4000;
export const MAX_NAME = 120;
const MAX_ITEMS = 20;

/** « a@x.ci, b@y.ci ; c » → liste nettoyée, sans doublon, 20 au plus. */
export function splitList(text: string): string[] {
  return [...new Set(text.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean))].slice(0, MAX_ITEMS);
}

export interface TriggerDraft {
  name: string;
  source: TriggerSource;
  instruction: string;
  senders: string;
  domains: string;
  keywords: string;
  leadMinutes: number;
  maxPerHour: number;
}

export function draftOf(t: Trigger | null, source: TriggerSource = "agentmail"): TriggerDraft {
  if (!t) return { name: "", source, instruction: "", senders: "", domains: "", keywords: "", leadMinutes: 15, maxPerHour: 6 };
  const f = t.filter;
  return { name: t.name, source: t.source, instruction: t.instruction, senders: f.senders.join(", "), domains: f.domains.join(", "), keywords: f.keywords.join(", "), leadMinutes: f.leadMinutes ?? 15, maxPerHour: t.maxPerHour };
}

/** Le filtre que la source accepte : adresses et domaines pour un mail, délai pour un rendez-vous. */
export function filterOf(d: TriggerDraft): Partial<TriggerFilter> {
  const keywords = splitList(d.keywords);
  if (d.source === "calendar") return { keywords, leadMinutes: d.leadMinutes };
  if (isMailSource(d.source)) return { senders: splitList(d.senders), domains: splitList(d.domains), keywords };
  return { keywords };
}

/** Le corps envoyé, ou la phrase qui dit quoi corriger. */
export function triggerPayload(d: TriggerDraft): { body: Record<string, unknown> } | { error: string } {
  const instruction = d.instruction.trim();
  if (!instruction) return { error: "Dites ce que l’expert doit faire quand l’événement arrive." };
  if (instruction.length > MAX_INSTRUCTION) return { error: `La consigne est trop longue : ${MAX_INSTRUCTION} caractères au plus.` };
  if (!Number.isInteger(d.maxPerHour) || d.maxPerHour < 1 || d.maxPerHour > 30) return { error: "Le plafond va de 1 à 30 fois par heure." };
  if (d.source === "calendar" && (!Number.isInteger(d.leadMinutes) || d.leadMinutes < 5 || d.leadMinutes > 240)) {
    return { error: "Le délai va de 5 à 240 minutes avant le rendez-vous." };
  }
  if (splitList(d.keywords).some((k) => k.length < 2 || k.length > 80)) return { error: "Un mot-clé fait de 2 à 80 caractères." };
  const name = d.name.trim().slice(0, MAX_NAME) || SOURCE_LABELS[d.source];
  return { body: { name, instruction, filter: filterOf(d), maxPerHour: d.maxPerHour } };
}

const ID_RE = /^[A-Za-z0-9_-]{8,40}$/;
export const isTriggerId = (v: string): boolean => ID_RE.test(v);

const PROFILE_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const ACCOUNT_RE = /^[A-Za-z0-9_-]{2,128}$/;

function pickFilter(v: unknown): Record<string, unknown> | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const strings = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string").slice(0, MAX_ITEMS) : undefined);
  const out: Record<string, unknown> = {};
  for (const k of ["senders", "domains", "keywords"] as const) if (strings(o[k])) out[k] = strings(o[k]);
  if (typeof o.leadMinutes === "number" || o.leadMinutes === null) out.leadMinutes = o.leadMinutes;
  return out;
}

/** Les seuls champs transmis au back-office, qui valide le reste ; null sans expert, source ni consigne. */
export function pickCreate(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  if (typeof o.expert !== "string" || !PROFILE_RE.test(o.expert) || !isTriggerSource(o.source) || typeof o.instruction !== "string" || typeof o.name !== "string") return null;
  return {
    expert: o.expert,
    name: o.name,
    source: o.source,
    instruction: o.instruction,
    ...(pickFilter(o.filter) ? { filter: pickFilter(o.filter) } : {}),
    ...(typeof o.maxPerHour === "number" ? { maxPerHour: o.maxPerHour } : {}),
    ...(typeof o.enabled === "boolean" ? { enabled: o.enabled } : {}),
    ...(typeof o.accountId === "string" && ACCOUNT_RE.test(o.accountId) ? { accountId: o.accountId } : {}),
  };
}

/** Source, expert et délai d'un rendez-vous ne changent pas : ils ne passent pas. */
export function pickPatch(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (typeof o.name === "string") out.name = o.name;
  if (typeof o.instruction === "string") out.instruction = o.instruction;
  if (pickFilter(o.filter)) out.filter = pickFilter(o.filter);
  if (typeof o.maxPerHour === "number") out.maxPerHour = o.maxPerHour;
  if (typeof o.enabled === "boolean") out.enabled = o.enabled;
  if (o.rotateKey === true) out.rotateKey = true;
  return Object.keys(out).length ? out : null;
}

// `bad_trigger` et `conflict` gardent la phrase du back-office : elle nomme le champ ou la cause.
const MESSAGES: Record<string, string> = {
  composio_refused: "L’application connectée refuse ce déclencheur. Vérifiez qu’elle est bien connectée dans Intégrations, puis réessayez.",
  composio_unavailable: "Les applications connectées ne répondent pas pour l’instant. Réessayez dans un instant.",
  not_found: "Ce déclencheur n’existe plus.",
};

export const triggerRefusalMessage = (code: string): string | null => MESSAGES[code] ?? null;
