import assert from "node:assert/strict";
import { test } from "node:test";
import { deadlineLabel, parseGoals, sortGoals } from "./objectifs.ts";

const raw = {
  objectifs: [
    { id: "a1", titre: "Relancer les impayés", resultat: "0 facture > 60 j", echeance: "2026-11-30", statut: "actif", prochaine: "Appeler Orange", a_suivre: ["Envoyer le récap", 4], etapes_faites: [{ texte: "Liste faite", le: "2026-11-08T10:00:00" }, { le: "x" }], proposition: null },
    { id: "b2", titre: "Clôture", statut: "bloque", raison: "Accès Sage manquant", echeance: "pas une date" },
    { id: "c3", titre: "Fini", statut: "atteint" },
    { titre: "sans id" },
    { id: "d4", titre: "<img src=x onerror=alert(1)>", statut: "inconnu" },
  ],
};

test("lecture bornée : entrée sans id écartée, statut inconnu = actif, date invalide ignorée", () => {
  const goals = parseGoals(raw);
  assert.deepEqual(goals.map((g) => g.id), ["a1", "b2", "c3", "d4"]);
  assert.deepEqual(goals[0].aSuivre, ["Envoyer le récap"]);
  assert.deepEqual(goals[0].etapesFaites, [{ texte: "Liste faite", le: "2026-11-08T10:00:00" }]);
  assert.equal(goals[1].echeance, null);
  assert.equal(goals[3].statut, "actif");
  assert.equal(goals[3].titre, "<img src=x onerror=alert(1)>"); // rendu comme texte par React
  assert.deepEqual(parseGoals({ objectifs: "x" }), []);
  assert.deepEqual(parseGoals(null), []);
});

test("bloqué d'abord, puis actif par échéance, atteint en dernier", () => {
  assert.deepEqual(sortGoals(parseGoals(raw)).map((g) => g.id), ["b2", "a1", "d4", "c3"]);
});

test("échéance lisible, dépassée seulement pour un objectif ouvert", () => {
  assert.equal(deadlineLabel({ echeance: "2026-11-30", statut: "actif" }, "2026-11-09"), "30 nov. 2026");
  assert.equal(deadlineLabel({ echeance: "2026-11-01", statut: "actif" }, "2026-11-09"), "1 nov. 2026 (dépassée)");
  assert.equal(deadlineLabel({ echeance: "2026-11-01", statut: "atteint" }, "2026-11-09"), "1 nov. 2026");
  assert.equal(deadlineLabel({ echeance: null, statut: "actif" }, "2026-11-09"), null);
});
