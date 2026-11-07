import assert from "node:assert/strict";
import { test } from "node:test";
import type { BuzzEntry } from "./buzz.ts";
import { candidatesOf, mentionsIn, replyMention, TOKEN, withReplyMention } from "./buzz-mentions.ts";

const k = (c: string) => c.repeat(64);
const dir: BuzzEntry[] = [
  { nom: "Selim", type: "personne", membre: "21", cles: [k("a")] },
  { nom: "Djénéba (de Selim)", type: "expert", membre: "21", cles: [k("b")] },
  { nom: "Leslie", type: "personne", membre: "16", cles: [k("c")] },
  { nom: "Mamadou (de Leslie)", type: "expert", membre: "16", cles: [k("d")] },
  { nom: "Awa (de Selim)", type: "expert", membre: "21", cles: [k("e")] },
];

test("« @ » propose les participants du salon, mes Experts en tête et sous leur prénom ; jamais moi", () => {
  const c = candidatesOf(dir, [k("a"), k("b"), k("c"), k("d")], "21", [k("a")]);
  assert.deepEqual(c.map((x) => [x.handle, x.mine]), [["Djénéba", true], ["Leslie", false], ["Mamadou (de Leslie)", false]], "Awa hors du salon, moi exclu");
});

test("seules partent les mentions encore présentes dans le texte", () => {
  const c = candidatesOf(dir, [k("b"), k("c"), k("d")], "21", [k("a")]);
  assert.deepEqual(mentionsIn("@Djénéba fais le chiffrage", c), [k("b")]);
  assert.deepEqual(mentionsIn("bonjour", c), []);
});

test("le mot « @… » en cours de saisie est reconnu, pas une adresse e-mail", () => {
  assert.equal(TOKEN.exec("merci @Dj")?.[2], "Dj");
  assert.equal(TOKEN.exec("@")?.[2], "");
  assert.equal(TOKEN.exec("selim@mstudio"), null);
});

test("répondre à mon Expert le mentionne (sans doublon) ; à l'Expert d'un autre ou à une personne, non", () => {
  const c = candidatesOf(dir, [k("a"), k("b"), k("c"), k("d")], "21", [k("a")]);
  assert.equal(replyMention(k("b"), c), k("b"));
  assert.deepEqual(withReplyMention([], k("b"), c), [k("b")]);
  assert.deepEqual(withReplyMention([k("b")], k("b"), c), [k("b")]);
  assert.deepEqual(withReplyMention([k("c")], k("b"), c), [k("c"), k("b")]);
  assert.deepEqual(withReplyMention([], k("d"), c), [], "l'Expert de Leslie");
  assert.deepEqual(withReplyMention([], k("c"), c), [], "une personne");
  assert.deepEqual(withReplyMention([], null, c), []);
});

test("group mentions: @tous for the people, @experts for mine, one per department", async () => {
  const { groupCandidates } = await import("./buzz-mentions.ts");
  const dir: BuzzEntry[] = [
    { nom: "Aïcha", type: "personne", membre: "a", cles: ["ka"], unite: "Direction" },
    { nom: "Konan", type: "personne", membre: "k", cles: ["kk"], unite: "Finance" },
    { nom: "Serge", type: "personne", membre: "s", cles: ["ks"], unite: "Finance" },
    { nom: "Fatima (de Aïcha)", type: "expert", membre: "a", cles: ["kf"] },
    { nom: "Mamadou (de Konan)", type: "expert", membre: "k", cles: ["km"] },
  ];
  const g = groupCandidates(dir, ["ka", "kk", "ks", "kf", "km"], "a", ["ka"]);
  assert.deepEqual(g.map((c) => [c.handle, c.entry.cles, c.mine]), [["tous", ["kk", "ks"], false], ["experts", ["kf"], true], ["Finance", ["kk", "ks"], false]]);
  assert.equal(g[0].group?.hint, "Prévient les 2 personnes du salon");
  assert.deepEqual(groupCandidates(dir, ["ka", "kk"], "a", ["ka"]).map((c) => c.handle), ["tous", "Finance"]);
});
