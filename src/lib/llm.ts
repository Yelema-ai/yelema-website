// The client's model keys, as the app sees them. The back office owns everything that matters: the
// list of providers, the check of a key with its provider, its encryption, its installation on the
// instances and its watch. This module only shapes what goes to it, and turns its refusal codes
// into the sentences a member reads. Contract: yelema-platform docs/specs/client-api-v1/app.md,
// "Clés de modèle du client".

import { ACCOUNT_REFUSALS, type LlmSetup } from "./llm-accounts.ts";

/** `refused`: the provider no longer accepts the key; the experts do not answer until it is replaced or removed. */
export type LlmState = "applied" | "pending" | "failed" | "refused";
/** Whose account an instance's model runs on: its own accounts, or Yelema's. `agent37` is the fallback when Yelema's own is down. */
export type LlmSource = "member" | "yelema" | "agent37";

export interface LlmProvider {
  id: string;
  label: string;
  placeholder: string;
  defaultModel: string | null;
  notice: string | null;
  /** False: the back office cannot check this kind of key before saving it. */
  verifiable: boolean;
  /** The provider's brand, for its mark: stable, unlike the label. */
  family: string;
}

/** A key in place. Never the key itself: `hint` is its last four characters. */
export interface LlmKey {
  provider: string;
  model: string;
  hint: string;
  verified: boolean;
  state: LlmState;
  updatedAt: string | null;
  /** A private endpoint only (`provider: "custom"`): its name and address, which are no secrets. */
  name?: string;
  baseUrl?: string;
}

/** The provider id of a private, OpenAI-compatible endpoint the client runs itself. */
export const CUSTOM_PROVIDER = "custom";

export interface LlmMine {
  source: LlmSource;
  /** Null when the model is Yelema's or Agent37's. */
  provider: string | null;
  model: string | null;
  state: LlmState;
  since: string | null;
}

export interface LlmMember {
  /** What the per-member routes take. */
  id: string;
  name: string | null;
  email: string;
  /** The caller's own row; absent from an older back office. */
  self?: boolean;
  source: LlmSource;
  state: LlmState;
  own: LlmKey | null;
  /** The member's own accounts; absent from an older back office. */
  setup?: LlmSetup;
}

export interface LlmOverview {
  catalogue: LlmProvider[];
  /** The signed-in user's instance; null when they have none. */
  mine: LlmMine | null;
  own: LlmKey | null;
  membersMayBringKey: boolean;
  /** Providers where a member signs in with a subscription instead of pasting a key. */
  logins?: LlmLogin[];
  /** Yelema's own models, open to every member with no key; null when Yelema's gateway is off. */
  yelema?: LlmYelema | null;
  /** True when the back office accepts a private endpoint; absent from an older one. */
  customEndpoints?: boolean;
  /** Admins only. */
  members?: LlmMember[];
  /** The accounts of the caller's own instance, grouped by provider; absent from an older back office. */
  setup?: LlmSetup;
}

/** The models Yelema offers to all its clients (its default first), and what the caller picked. */
export interface LlmYelema {
  default: string;
  models: { id: string; label: string }[];
  /** `model`: for the whole instance, null = Yelema's default. `profiles`: per expert, where it differs. */
  own: { model: string | null; profiles: Record<string, string> };
}

/** A pick among Yelema's models: for the whole instance, or for one expert (`profile`). `model: null` goes back to the default. */
export interface LlmModelChoice {
  model: string | null;
  profile?: string;
}

const MODEL_NAME = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/;
const PROFILE_NAME = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** A model pick from a request body, with nothing but its two fields; null when it is not one. */
export function parseModelChoice(body: unknown): LlmModelChoice | null {
  if (!body || typeof body !== "object") return null;
  const { model, profile } = body as Record<string, unknown>;
  if (model !== null && (typeof model !== "string" || !MODEL_NAME.test(model))) return null;
  if (profile === undefined) return { model };
  return typeof profile === "string" && PROFILE_NAME.test(profile) ? { model, profile } : null;
}

/** The sentence for a refused pick: the list is Yelema's, not an account's, and its names are not shown back. */
export function modelChoiceRefusal(code: string): string | null {
  if (code === "unknown_model") return "Ce modèle n’est plus proposé. Rechargez la page pour voir la liste à jour.";
  if (code === "unknown_profile") return "Cet Expert n’est pas installé sur votre instance.";
  if (code === "unavailable") return "Les modèles de Yelema sont momentanément indisponibles. Réessayez plus tard.";
  return llmRefusalMessage(code);
}

export interface LlmLogin {
  id: string;
  label: string;
  family: string;
}

/** The page the member is sent to must be a web page over TLS: the address comes from an instance. */
export function safeVerificationUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export interface LlmWritten {
  ok: true;
  verified?: boolean;
  state: "pending" | "applied";
}

/** What a key is set for: the whole company, one member (by an admin), or the user themself. */
export type SettingScope = { kind: "client" } | { kind: "member"; id: string } | { kind: "own" };

const MEMBER_ID = /^\d{1,12}$/;
export const isMemberId = (id: unknown): id is string => typeof id === "string" && MEMBER_ID.test(id);

/** The back office's path for a scope under `base` (`/app/llm`, `/app/mcp`); null for an id that is not one. */
export function scopePath(base: string, scope: SettingScope): string | null {
  if (scope.kind === "client") return `${base}/client`;
  if (scope.kind === "own") return `${base}/own`;
  return isMemberId(scope.id) ? `${base}/members/${scope.id}` : null;
}

const REFUSALS: Record<string, string> = {
  unknown_provider: "Ce fournisseur n’est pas disponible.",
  bad_secret_format: "Cette clé n’a pas la forme attendue pour ce fournisseur. Vérifiez qu’elle est copiée en entier.",
  secret_refused: "Le fournisseur refuse cette clé. Vérifiez qu’elle est active et qu’elle vient du bon compte.",
  unknown_model: "Ce modèle n’existe pas sur ce compte.",
  bad_name: "Ce nom n’est pas valide : une lettre, puis des lettres, des chiffres ou des tirets, 40 caractères au plus, sans espace.",
  reserved_name: "Ce nom est réservé. Choisissez-en un autre.",
  bad_url: "Cette adresse n’est pas acceptée : elle doit commencer par https:// et être joignable depuis Internet.",
  no_instance: "L’instance de ce membre n’est pas encore en service. Réessayez une fois ses Experts installés.",
  login_unavailable: "La connexion à ce fournisseur n’a pas pu démarrer. Réessayez dans un instant.",
  bad_request: "Cette demande n’a pas pu être traitée.",
  forbidden: "Ce réglage est réservé aux administrateurs de votre espace.",
  not_found: "Ce membre est introuvable.",
  too_many_attempts: "Trop d’essais en peu de temps. Réessayez dans une heure.",
  unavailable: "L’enregistrement est momentanément indisponible. Réessayez plus tard.",
};

/**
 * The sentence for one of the back office's refusal codes, or null for a code that is not one of
 * these (the caller then answers its usual sentence). The back office's own text is never shown.
 */
export function llmRefusalMessage(code: string, suggestions: readonly unknown[] = []): string | null {
  const sentence = Object.hasOwn(REFUSALS, code) ? REFUSALS[code] : Object.hasOwn(ACCOUNT_REFUSALS, code) ? ACCOUNT_REFUSALS[code] : undefined;
  if (!sentence) return null;
  // Model names come from the provider's list: only plain ones are shown, and only a few.
  const models = suggestions.filter((m): m is string => typeof m === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/-]{1,120}$/.test(m)).slice(0, 6);
  return code === "unknown_model" && models.length ? `${sentence} Modèles proposés : ${models.join(", ")}.` : sentence;
}

export const LLM_SOURCE_LABELS: Record<LlmSource, string> = {
  member: "Comptes de l’instance",
  yelema: "Yelema (moteur inclus)",
  agent37: "Yelema (moteur de secours)",
};

export const LLM_STATE_LABELS: Record<LlmState, string> = {
  applied: "En service",
  pending: "Installation en cours",
  failed: "Installation en échec",
  refused: "Clé refusée par le fournisseur",
};

/** True while the back office is still installing a key somewhere the caller can see. */
export function llmPending(o: LlmOverview): boolean {
  const setups = [o.setup, ...(o.members ?? []).map((m) => m.setup)];
  return [o.mine?.state, o.own?.state, ...(o.members ?? []).map((m) => m.state), ...setups.map((s) => s?.state)].includes("pending");
}
