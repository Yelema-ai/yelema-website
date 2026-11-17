// « Conseillés pour vos Experts » on Connecteurs (Leslie, 03/11): the applications the member's Experts
// list in their pack (`outils-recommandes.json`), the essential ones first, those already connected
// left out. Pure, so `node --test` runs it as is.
import type { ExpertTool } from "./expert-tools.ts";

export interface RecommendedTool {
  /** Composio toolkit slug. */
  slug: string;
  /** The name the pack gives it, for a tool the catalog does not know. */
  name: string;
  /** Who needs it (the cycles of the Experts), in the order of the team. */
  experts: string[];
  essential: boolean;
}

export const MAX_RECOMMENDED = 6;

/** The tools to suggest, from each Expert's list: connectable ones only (an application with a slug). */
export function recommendTools(
  lists: readonly { expert: string; tools: readonly ExpertTool[] }[],
  connected: ReadonlySet<string>,
  max = MAX_RECOMMENDED
): RecommendedTool[] {
  const bySlug = new Map<string, RecommendedTool & { first: number }>();
  let rank = 0;
  for (const { expert, tools } of lists) {
    for (const t of tools) {
      const slug = t.type === "application" ? t.composio?.toLowerCase() : null;
      if (!slug || connected.has(slug)) continue;
      const had = bySlug.get(slug);
      if (had) {
        if (!had.experts.includes(expert)) had.experts.push(expert);
        had.essential ||= t.priorite === "essentiel";
        continue;
      }
      bySlug.set(slug, { slug, name: t.nom, experts: [expert], essential: t.priorite === "essentiel", first: rank++ });
    }
  }
  // Essential first, then the tools more Experts share, then the team's order.
  return [...bySlug.values()]
    .sort((a, b) => Number(b.essential) - Number(a.essential) || b.experts.length - a.experts.length || a.first - b.first)
    .slice(0, max)
    .map(({ first: _first, ...t }) => t);
}

// A cycle in a sentence (Leslie, 04/11: « pour le marketing », not the Experts' first names).
const WITH_ARTICLE: Record<string, string> = {
  Direction: "la direction",
  Commercial: "le commercial",
  Marketing: "le marketing",
  "Service client": "le service client",
  RH: "les RH",
  Finance: "la finance",
  Opérations: "les opérations",
  Investissement: "l’investissement",
};
const inSentence = (who: string) => WITH_ARTICLE[who] ?? who;

/** « Pour le marketing », « Pour le marketing et la finance », « Pour le marketing, la finance et 2 autres ». */
export function forWhom(who: readonly string[]): string {
  const w = who.map(inSentence);
  if (w.length === 0) return "";
  if (w.length === 1) return `Pour ${w[0]}`;
  if (w.length === 2) return `Pour ${w[0]} et ${w[1]}`;
  const rest = w.length - 2;
  return `Pour ${w[0]}, ${w[1]} et ${rest > 1 ? `${rest} autres` : w[2]}`;
}
