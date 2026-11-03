import assert from "node:assert/strict";
import { test } from "node:test";
import { replyLines } from "./reply-lines.ts";

test("a report written one idea per line keeps its lines and its rules", () => {
  const report = [
    "🌙 POINT DE FIN DE JOURNÉE · vendredi 30 octobre ──────────────",
    "",
    "📡 MTN Côte d'Ivoire : support client",
    "✅ 6 réponses clients rédigées, sans envoi",
    "🔗 [Ouvrir le manuel des conseillers](https://example.org/manuel)",
    "⏭️ Lundi 2 novembre : j'ajuste le manuel",
    "",
    "────────────── 💬 Une tâche pour la nuit ?",
  ].join("\n");
  assert.equal(
    replyLines(report),
    [
      "🌙 **POINT DE FIN DE JOURNÉE** · vendredi 30 octobre",
      "",
      "---",
      "",
      "📡 MTN Côte d'Ivoire : support client  ",
      "✅ 6 réponses clients rédigées, sans envoi  ",
      "[**Ouvrir le manuel des conseillers**](https://example.org/manuel)  ",
      "⏭️ Lundi 2 novembre : j'ajuste le manuel",
      "",
      "---",
      "",
      "💬 Une tâche pour la nuit ?",
    ].join("\n")
  );
});

test("code, tables, lists and links in a sentence are left as they are", () => {
  const code = "```\nligne 1\nligne 2\n```";
  assert.equal(replyLines(code), code);
  const table = "| a | b |\n| - | - |\n| 1 | 2 |";
  assert.equal(replyLines(table), table);
  assert.equal(replyLines("Voici :\n- un\n- deux"), "Voici :\n- un\n- deux");
  assert.equal(replyLines("Le [rapport](https://x.org) est prêt."), "Le [rapport](https://x.org) est prêt.");
  assert.equal(replyLines("Titre\n---"), "Titre\n---");
});

test("a section title in capitals is bold, up to its « · »", () => {
  assert.equal(replyLines("🌙 POINT DE FIN DE JOURNÉE · vendredi 30 octobre"), "🌙 **POINT DE FIN DE JOURNÉE** · vendredi 30 octobre");
  assert.equal(replyLines("📅 MA LECTURE DE LA SEMAINE"), "📅 **MA LECTURE DE LA SEMAINE**");
  assert.equal(replyLines("✅ 6 réponses clients rédigées"), "✅ 6 réponses clients rédigées");
  assert.equal(replyLines("MTN a validé"), "MTN a validé");
});

test("bullets written inside a sentence become a list", () => {
  assert.equal(
    replyLines("J'ai regardé : • Yelema est née de Mstudio. • Les Experts travaillent dans vos outils. Dites-moi si je me trompe."),
    "J'ai regardé :\n\n- Yelema est née de Mstudio.\n- Les Experts travaillent dans vos outils. Dites-moi si je me trompe."
  );
  assert.equal(replyLines("Prix • 200 000 F"), "Prix • 200 000 F");
});

test("options A and B in a sentence go on their own lines", () => {
  assert.equal(
    replyLines("1. **CTO** : quel est son rôle ? A. Il construit l'équipe. B. Il garde la plateforme. À défaut, je pars sur A."),
    "1. **CTO** : quel est son rôle ?  \n   **A.** Il construit l'équipe.  \n   **B.** Il garde la plateforme. À défaut, je pars sur A."
  );
  assert.equal(replyLines("Le plan A. Rien d'autre."), "Le plan A. Rien d'autre.");
});

test("numbered items in the sentence or under a title become a list (Leslie, 31/10)", () => {
  assert.equal(
    replyLines("**Ensuite** 4. **La paie.** Fixer le cycle. 5. **Une grille.** Elle évite.\n\n**Quand l'équipe grandit** 8. L'accueil."),
    "**Ensuite**\n\n4. **La paie.** Fixer le cycle.\n5. **Une grille.** Elle évite.\n\n**Quand l'équipe grandit**\n\n8. L'accueil."
  );
  assert.equal(replyLines("**Ensuite**\n4. **La paie.**\n5. **La grille.**"), "**Ensuite**\n\n4. **La paie.**\n5. **La grille.**");
  assert.equal(replyLines("1. Premier point. 2. Deuxième point."), "1. Premier point.\n2. Deuxième point.");
  assert.equal(replyLines("Il reste 3. Pas plus. Le budget est de 5. Nous verrons."), "Il reste 3. Pas plus. Le budget est de 5. Nous verrons.");
  assert.equal(replyLines("Voici :\n1. Un\n2. Deux"), "Voici :\n\n1. Un\n2. Deux");
});
