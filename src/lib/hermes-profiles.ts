import "server-only";
import { agent37 } from "@/lib/agent37";
import { ApiError } from "@/lib/http";

// Lecture des profils Hermes installés sur une instance.
//
// Agent37 n'expose rien sur les profils : sa documentation couvre les instances, les sessions,
// les modèles et les fichiers, pas les profils. Le seul chemin est l'échappatoire générique
// POST /v1/instances/{id}/exec, comme la messagerie (`hermes-messaging.ts`).
//
// La SOURCE est la CLI `hermes profile list`, relevée sur une instance réelle le 2 octobre 2026 :
// elle donne l'état de la passerelle et la version de distribution, que le disque ne donne pas.
// La liste des dossiers ne sert que de repli si la CLI manque.
//
// Emplacements réels constatés : `$HOME/.hermes/profiles` (et un `$HOME/.yelema/profiles` à
// côté). `HERMES_HOME` n'est PAS défini dans l'image — ne pas s'y fier.
//
// Le script ne contient aucun guillemet : tout le texte libre revient en base64.

const HERMES_HOME_DEFAULT = "$HOME/.hermes";
const OUTPUT_MARKER = "A37_PROFILES_JSON:";

/** Profil interne d'Hermes, jamais un Expert. */
const BUILTIN_PROFILES = new Set(["default"]);

/** La CLI écrit un tiret cadratin pour « rien ». */
const NONE = "—";

export interface HermesProfile {
  id: string;
  /** Modèle associé, ou null. */
  model: string | null;
  /** État de la passerelle du profil — « running » quand il peut répondre. */
  gateway: string | null;
  alias: string | null;
  /** Distribution installée, par exemple `djeneba@7.0.0`. */
  distribution: string | null;
  /** Profil actif de l'instance (marqué d'un losange par la CLI). */
  active: boolean;
}

export interface HermesProfilesResult {
  profiles: HermesProfile[];
  cliAvailable: boolean;
  /** Sortie brute, conservée : c'est elle qui permet de corriger le parseur sans redéployer. */
  cliRaw: string | null;
}

const SCRIPT = `
cli_available=false
cli_b64=""
if command -v hermes >/dev/null 2>&1; then
  cli_available=true
  cli_b64=$(hermes profile list 2>&1 | head -c 8000 | base64 | tr -d '\\n')
fi

dir="\${HERMES_HOME:-${HERMES_HOME_DEFAULT}}/profiles"
names=""
if [ -d "$dir" ]; then
  for p in "$dir"/*/; do
    [ -d "$p" ] || continue
    names="$names$(basename "$p")
"
  done
fi

printf '%s' '${OUTPUT_MARKER}'
printf '{"cliAvailable":%s,"cliB64":"%s","namesB64":"%s"}' \\
  "$cli_available" "$cli_b64" "$(printf '%s' "$names" | base64 | tr -d '\\n')"
`.trim();

function decode(b64: string | undefined): string {
  if (!b64) return "";
  try {
    return Buffer.from(b64, "base64").toString("utf8");
  } catch {
    return "";
  }
}

function cell(value: string | undefined): string | null {
  const v = value?.trim();
  return !v || v === NONE ? null : v;
}

/**
 * Parse la table de `hermes profile list`.
 *
 * Format relevé :
 *
 *     Profile          Model      Gateway    Alias    Distribution
 *      ──────────────    ───────    ───────    ─────    ────────────
 *      ◆default         default    running    —        —
 *       djeneba         —          running    —        djeneba@7.0.0
 *
 * Les colonnes sont séparées par au moins deux espaces ; le losange marque le profil actif.
 * Exporté pour être testable sans instance.
 */
export function parseProfileList(raw: string): HermesProfile[] {
  const lines = raw.split("\n");
  const separator = lines.findIndex((l) => l.includes("─"));
  // Pas de ligne de séparation : format inattendu, mieux vaut ne rien affirmer.
  if (separator < 0) return [];

  const profiles: HermesProfile[] = [];
  for (const line of lines.slice(separator + 1)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const active = trimmed.startsWith("◆");
    const cols = (active ? trimmed.slice(1) : trimmed).split(/\s{2,}/);
    const id = cols[0]?.trim();
    if (!id || BUILTIN_PROFILES.has(id)) continue;

    profiles.push({
      id,
      model: cell(cols[1]),
      gateway: cell(cols[2]),
      alias: cell(cols[3]),
      distribution: cell(cols[4]),
      active,
    });
  }
  return profiles;
}

function unavailable(agentId: string, detail: string): ApiError {
  console.error(`[profiles] lecture impossible sur ${agentId}`, detail.slice(0, 500));
  return new ApiError(
    502,
    "profiles_unavailable",
    "Les profils de cet expert ne sont pas lisibles pour le moment. Réessayez dans un instant."
  );
}

/**
 * Liste les profils installés sur une instance.
 *
 * Lève une `ApiError` 502 quand l'instance n'a pas répondu quelque chose d'exploitable : une
 * instance qui démarre encore doit se lire comme « réessayez », jamais comme « aucun profil ».
 */
export async function listInstanceProfiles(agentId: string): Promise<HermesProfilesResult> {
  const result = await agent37.exec(agentId, SCRIPT);

  const marked = result.stdout.indexOf(OUTPUT_MARKER);
  if (marked < 0) throw unavailable(agentId, result.stderr || result.stdout);

  let parsed: { cliAvailable?: boolean; cliB64?: string; namesB64?: string };
  const payload = result.stdout.slice(marked + OUTPUT_MARKER.length).trim();
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw unavailable(agentId, payload);
  }

  const cliRaw = decode(parsed.cliB64).trim() || null;
  const fromCli = cliRaw ? parseProfileList(cliRaw) : [];

  // Repli sur le disque : moins riche, mais mieux que rien si la CLI disparaît d'une image.
  const profiles =
    fromCli.length > 0
      ? fromCli
      : decode(parsed.namesB64)
          .split("\n")
          .map((n) => n.trim())
          .filter((n) => n && !BUILTIN_PROFILES.has(n))
          .map((id) => ({ id, model: null, gateway: null, alias: null, distribution: null, active: false }));

  return { profiles, cliAvailable: Boolean(parsed.cliAvailable), cliRaw };
}
