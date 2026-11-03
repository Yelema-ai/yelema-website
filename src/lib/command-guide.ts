// What Yélé answers to « comment je fais pour… » (Leslie, 01/11): the Expert who does it, the command
// in plain words, what it does and an example. Built on the same list as the « / » menu of the composer
// (expert-commands), so Yélé never names a command an Expert does not have. No imports from `@/`: tested.
import { commandsOf, type ExpertCommand } from "./expert-commands.ts";

export interface GuideExpert {
  /** The Hermes profile (« unifood__koffi »). */
  id: string;
  /** The name the client knows (« Koffi »). */
  name: string;
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

// Words that say nothing about the need (« comment je fais pour préparer un devis »).
const EMPTY = new Set(
  "comment faire fais fait pour avec dans sur une des les aux mon mes ton nos vos votre notre quoi quel quelle quels quelles est veux voudrais peux peut faut besoin aide aider moi nous elle lui qui que dont cette ces son ses leur".split(" ")
);

function words(text: string): string[] {
  return fold(text)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !EMPTY.has(w));
}

const key = (profile: string) => (profile.includes("__") ? profile.slice(profile.indexOf("__") + 2) : profile);

// A word of the need matches a word of the command when one starts with the other, past 4 letters
// (« devis » / « devis », « prospect » / « prospects », « relancer » / « relance »). A match in the
// command's name counts double, in the command itself once more: « relancer un client » is /relance
// before /rdv.
function hits(need: string[], command: ExpertCommand): number {
  const near = (w: string, own: string[]) => {
    const stem = w.slice(0, Math.max(4, Math.min(w.length, 6)));
    return own.some((o) => o === w || o.startsWith(stem) || (o.length >= 4 && w.startsWith(o)));
  };
  const name = words(`${command.cmd} ${command.label}`);
  const phrase = words(command.phrase);
  let n = 0;
  for (const w of need) n += (near(w, [command.cmd]) ? 1 : 0) + (near(w, name) ? 2 : near(w, phrase) ? 1 : 0);
  return n;
}

function line(expert: string, c: ExpertCommand): string {
  const example = c.example ? ` Exemple : « /${c.cmd} ${c.example} ».` : "";
  const need = c.need ? ` À préciser : ${c.need}.` : "";
  return `- ${expert}, « ${c.label} » (/${c.cmd}) : ${c.phrase}${example}${need}`;
}

const HOW =
  "Comment s'en servir : dans la conversation de l'Expert, tapez « / » et choisissez la commande, ou écrivez simplement la demande en mots. Ne jamais citer une commande absente de cette liste.";

/**
 * The commands that answer a need, across the client's installed Experts (or one of them), best first.
 * Without a need: each Expert and the names of its own commands.
 */
export function commandGuide(experts: GuideExpert[], need?: string, expert?: string): string {
  const wanted = expert ? fold(expert) : null;
  const team = experts
    .map((e) => ({ name: e.name, list: commandsOf(key(e.id), e.name) }))
    .filter((e) => e.list.length > 0 && (!wanted || fold(e.name).includes(wanted) || wanted.includes(fold(e.name))));
  if (team.length === 0) {
    return expert ? `Aucune commande connue pour ${expert}. Proposez d'écrire la demande en mots à l'Expert.` : "Aucun Expert installé n'a de commande.";
  }

  const asked = need ? words(need) : [];
  if (asked.length === 0) {
    const rows = team.map((e) => `- ${e.name} : ${e.list.filter((c) => !c.common).map((c) => `« ${c.label} » (/${c.cmd})`).join(", ") || "commandes communes seulement"}`);
    const common = team[0].list.filter((c) => c.common).map((c) => `« ${c.label} » (/${c.cmd})`);
    return [`Commandes des Experts de l'entreprise :`, ...rows, common.length ? `Chez tous les Experts : ${common.join(", ")}.` : "", HOW].filter(Boolean).join("\n");
  }

  const found = team
    .flatMap((e) => e.list.map((c) => ({ expert: e.name, c, score: hits(asked, c) * (c.common ? 1 : 2) })))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
  // A common command (« Chercher sur le web ») answers once, not once per Expert.
  const seen = new Set<string>();
  const best = found.filter((r) => {
    const id = r.c.common ? r.c.cmd : `${r.expert}/${r.c.cmd}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  if (best.length === 0) {
    return `Aucune commande ne correspond à « ${need} ». L'Expert le plus proche du sujet peut le faire si on lui écrit la demande en mots.`;
  }
  return [`Pour « ${need} » :`, ...best.slice(0, 5).map((r) => line(r.c.common ? "Tous les Experts" : r.expert, r.c)), HOW].join("\n");
}
