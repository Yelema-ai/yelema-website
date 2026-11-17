// Objectifs d'un expert, lus sur l'instance (`GET /p/<expert>/api/objectifs`, image Hermes I68). Lecture seule :
// on agit dessus dans la conversation. Pur : `node --test`.

export const GOAL_STATUSES = ["actif", "atteint", "bloque", "en_pause"] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export interface Goal {
  id: string;
  titre: string;
  resultat: string;
  echeance: string | null;
  statut: GoalStatus;
  raison: string | null;
  prochaine: string | null;
  aSuivre: string[];
  etapesFaites: { texte: string; le: string | null }[];
  dernierProgresLe: string | null;
  proposition: string | null;
  majLe: string | null;
}

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = { actif: "Actif", atteint: "Atteint", bloque: "Bloqué", en_pause: "En pause" };

const TEXT_MAX = 600;
const LIST_MAX = 50;
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, TEXT_MAX) : null);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** La réponse de l'instance, bornée ; une entrée sans id ni titre est écartée. */
export function parseGoals(raw: unknown): Goal[] {
  const list = raw && typeof raw === "object" ? (raw as { objectifs?: unknown }).objectifs : null;
  if (!Array.isArray(list)) return [];
  const goals: Goal[] = [];
  for (const o of list.slice(0, LIST_MAX)) {
    if (!o || typeof o !== "object") continue;
    const g = o as Record<string, unknown>;
    const id = text(g.id);
    const titre = text(g.titre);
    if (!id || !titre) continue;
    const echeance = text(g.echeance);
    goals.push({
      id,
      titre,
      resultat: text(g.resultat) ?? "",
      echeance: echeance && DATE_RE.test(echeance) ? echeance : null,
      statut: GOAL_STATUSES.includes(g.statut as GoalStatus) ? (g.statut as GoalStatus) : "actif",
      raison: text(g.raison),
      prochaine: text(g.prochaine),
      aSuivre: Array.isArray(g.a_suivre) ? g.a_suivre.map(text).filter((s): s is string => s !== null).slice(0, LIST_MAX) : [],
      etapesFaites: Array.isArray(g.etapes_faites)
        ? g.etapes_faites
            .map((e) => (e && typeof e === "object" ? { texte: text((e as Record<string, unknown>).texte), le: text((e as Record<string, unknown>).le) } : null))
            .filter((e): e is { texte: string; le: string | null } => e !== null && e.texte !== null)
            .slice(-LIST_MAX)
        : [],
      dernierProgresLe: text(g.dernier_progres_le),
      proposition: text(g.proposition),
      majLe: text(g.maj_le),
    });
  }
  return goals;
}

const ORDER: Record<GoalStatus, number> = { bloque: 0, actif: 1, en_pause: 2, atteint: 3 };

/** Ce qui demande l'attention d'abord (bloqué, puis actif), l'échéance la plus proche en tête. */
export function sortGoals(goals: Goal[]): Goal[] {
  return [...goals].sort((a, b) => ORDER[a.statut] - ORDER[b.statut] || (a.echeance ?? "9999").localeCompare(b.echeance ?? "9999"));
}

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/** « 2026-11-30 » → « 30 nov. 2026 », « dépassée » quand elle est passée et l'objectif ouvert. */
export function deadlineLabel(g: Pick<Goal, "echeance" | "statut">, today: string): string | null {
  if (!g.echeance) return null;
  const [y, m, d] = g.echeance.split("-").map(Number);
  const label = `${d} ${MONTHS[m - 1]} ${y}`;
  return g.echeance < today && g.statut !== "atteint" ? `${label} (dépassée)` : label;
}
