// The commands an Expert understands (« /devis », « /memoire »…), in the client's words: what each one
// does, an example, and what it needs before it can run. The list comes from the Experts' package
// (8-commandes of each Expert, see expert-commands.data.ts); the client never has to know the names.
import { COMMAND_DEFS, EXPERT_COMMANDS } from "./expert-commands.data.ts";

export interface ExpertCommand {
  /** The command typed after « / ». */
  cmd: string;
  /** A short name in plain French (« Préparer un devis »). */
  label: string;
  /** One sentence: what the command does. */
  phrase: string;
  /** What follows the command in an example (« 200 cartons livrés à Bouaké »), or "". */
  example: string;
  /** What must be written before sending (« le client »), or null when the command runs alone. */
  need: string | null;
  /** A joined file is enough to send (« /resume » with the document). */
  fileOk: boolean;
  /** Shared by every Expert; the others are the Expert's own trade. */
  common: boolean;
}

function slug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * The commands of one Expert, its trade first: by catalogue key, then by first name (some profiles are
 * named after the job, the package after the persona). An Expert the package does not know gets none.
 */
export function commandsOf(catalogueKey: string | null | undefined, name?: string | null): ExpertCommand[] {
  const keys = [catalogueKey, name].filter(Boolean).map((k) => slug(k as string));
  const key = Object.keys(EXPERT_COMMANDS).find((k) => keys.includes(slug(k)));
  if (!key) return [];
  const list = EXPERT_COMMANDS[key].map((k) => COMMAND_DEFS[k]).filter(Boolean);
  return [...list.filter((c) => !c.common), ...list.filter((c) => c.common)];
}

/** The commands matching what follows « / », by command name or by a word of their name. */
export function filterCommands(list: ExpertCommand[], typed: string): ExpertCommand[] {
  const q = slug(typed);
  if (!q) return list;
  const starts = list.filter((c) => slug(c.cmd).startsWith(q));
  const words = list.filter(
    (c) => !starts.includes(c) && (slug(c.cmd).includes(q) || c.label.split(/\s+/).some((w) => slug(w).startsWith(q)))
  );
  return [...starts, ...words];
}

/** What is still missing before the command can be sent, or null when it can go. */
export function missingFor(command: ExpertCommand, text: string, hasFiles: boolean): string | null {
  if (!command.need || text.trim()) return null;
  if (command.fileOk && hasFiles) return null;
  return command.need;
}
