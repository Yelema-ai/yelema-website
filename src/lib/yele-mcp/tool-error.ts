// Ce qu'un outil dit au modèle quand il échoue : jamais le texte d'une erreur interne.
import { randomUUID } from "node:crypto";

/** Une panne dont le texte est écrit pour le lecteur (« … illisible pour le moment ») et peut lui être dit. */
export class ToolNotice extends Error {}

/** `failure` suivi du texte d'un `ToolNotice`, sinon d'une référence ; le détail va au journal sous cette référence. */
export function toolFailure(failure: string, e: unknown, log: (line: string) => void = console.warn): string {
  if (e instanceof ToolNotice) return `${failure} : ${e.message}`;
  const ref = randomUUID().slice(0, 8);
  log(`[yele-mcp] ${failure} (réf. ${ref}) : ${(e instanceof Error ? e.message : String(e)).slice(0, 400)}`);
  return `${failure} (réf. ${ref}).`;
}
