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
