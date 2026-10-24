// Identifiants de sites confiés aux experts (coffre Hermes de l'instance), tels que l'app les voit.
// Le back-office contrôle tout et n'en garde rien ; ce module ne fait que former ce qui part vers lui
// et traduire ses refus. Contrat : yelema-platform docs/specs/client-api-v1, `/app/vault`.

export type IdentifierType = "email" | "phone" | "username";

/** Une connexion en place. Jamais son mot de passe. */
export interface VaultItem {
  id: string;
  label: string;
  origin: string;
  identifierType: IdentifierType;
  identifier: string;
  purpose: string;
  createdAt: string | null;
}

export interface VaultList {
  profile: string;
  /** `default`, puis les experts installés sur cette instance. */
  profiles: string[];
  items: VaultItem[];
}

/** Une connexion avec l'expert qui la porte (vue de toute l'instance). */
export type VaultEntry = VaultItem & { profile: string };

export interface VaultOverview {
  /** `default`, puis les experts installés sur l'instance. */
  profiles: string[];
  items: VaultEntry[];
}

/** Les connexions d'un expert, ou de tous (`null`), les plus récentes d'abord. */
export function entriesOf(items: VaultEntry[], profile: string | null): VaultEntry[] {
  return items.filter((i) => profile === null || i.profile === profile).sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

export interface VaultDraft {
  label: string;
  origin: string;
  identifierType: IdentifierType;
  identifier: string;
  password: string;
  purpose: string;
}

export const IDENTIFIER_TYPES: { value: IdentifierType; label: string }[] = [
  { value: "email", label: "E-mail" },
  { value: "username", label: "Nom d’utilisateur" },
  { value: "phone", label: "Téléphone" },
];

/** Qui on vise : sa propre instance, ou (administrateur) celle d'un membre. */
export type VaultScope = { kind: "own" } | { kind: "member"; id: string };

const PROFILE = /^(default|[a-z0-9][a-z0-9_-]{0,63})$/;
const HANDLE = /^[A-Za-z0-9_-]{1,64}$/;
const MEMBER_ID = /^\d{1,12}$/;

/** Le chemin du back-office pour un profil d'une portée ; null pour un identifiant malformé. */
export function vaultPath(scope: VaultScope, profile: unknown, handle?: unknown): string | null {
  if (typeof profile !== "string" || !PROFILE.test(profile)) return null;
  if (scope.kind === "member" && !MEMBER_ID.test(scope.id)) return null;
  const base = scope.kind === "own" ? `/app/vault/own/${profile}` : `/app/vault/members/${scope.id}/${profile}`;
  if (handle === undefined) return base;
  return typeof handle === "string" && HANDLE.test(handle) ? `${base}/${handle}` : null;
}

/** Un brouillon tiré d'un corps de requête, avec ses six champs seulement ; null sinon. Bornes larges : le back-office tient les vraies règles. */
export function parseVaultDraft(body: unknown): VaultDraft | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === "string" && v.length <= max ? v : null);
  const label = str(b.label, 200);
  const origin = str(b.origin, 2000);
  const identifier = str(b.identifier, 300);
  const password = str(b.password, 1100);
  const purpose = b.purpose === undefined ? "" : str(b.purpose, 400);
  if (!label?.trim() || !origin?.trim() || !identifier?.trim() || !password || purpose === null) return null;
  if (!IDENTIFIER_TYPES.some((t) => t.value === b.identifierType)) return null;
  return { label: label.trim(), origin: origin.trim(), identifierType: b.identifierType as IdentifierType, identifier: identifier.trim(), password, purpose: purpose.trim() };
}

/** Le profil de l'instance elle-même, qui n'est pas un Expert : il ne se propose pas dans les listes. */
export const INSTANCE_PROFILE = "default";

/** Le nom affiché d'un profil, à défaut du nom que le catalogue donne : « Accès commun » pour l'instance, sinon le prénom de l'expert. */
export function profileLabel(profile: string): string {
  if (profile === INSTANCE_PROFILE) return "Accès commun";
  const name = profile.split("__").at(-1) ?? profile;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

const REFUSALS: Record<string, string> = {
  bad_label: "Donnez un libellé à cette connexion (80 caractères au plus).",
  bad_origin: "Cette adresse n’est pas acceptée : elle doit commencer par https:// et être joignable depuis Internet.",
  bad_identifier_type: "Choisissez le type d’identifiant : e-mail, nom d’utilisateur ou téléphone.",
  bad_identifier: "Saisissez l’identifiant (254 caractères au plus).",
  bad_password: "Saisissez le mot de passe.",
  bad_purpose: "La description fait 300 caractères au plus.",
  bad_request: "Cette demande n’a pas pu être traitée.",
  not_found: "Cet Expert ou cette connexion est introuvable.",
  conflict: "Cette instance n’est pas encore prête. Réessayez dans quelques minutes.",
  too_many_attempts: "Trop d’essais en peu de temps. Réessayez dans une heure.",
  instance_error: "L’instance n’a pas pu traiter la demande. Réessayez dans un instant.",
  unavailable: "Le coffre est momentanément indisponible sur cette instance. Réessayez plus tard.",
};

/** La phrase d'un code de refus du back-office ; null pour un code inconnu. */
export function vaultRefusalMessage(code: string): string | null {
  return Object.hasOwn(REFUSALS, code) ? REFUSALS[code] : null;
}
