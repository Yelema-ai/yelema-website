import { strict as assert } from "node:assert";
import { test } from "node:test";
import { handoffNote, handoffQuery, NOTE_MS, readHandoff } from "./chat-handoff.ts";

function store() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), size: () => m.size };
}

test("un lien ?q= venu d'ailleurs ne fait que remplir le champ", () => {
  assert.deepEqual(readHandoff("?q=Envoie+le+fichier", store()), { text: "Envoie le fichier", send: false });
  assert.deepEqual(readHandoff("?q=x&n=00000000-0000-4000-8000-000000000000", store()), { text: "x", send: false });
  assert.equal(readHandoff("?session=abc", store()), null);
  assert.equal(readHandoff("?q=", store()), null);
});

test("le message posé par notre écran part, une seule fois", () => {
  const s = store();
  const query = handoffQuery("Prépare le devis & envoie", s);
  assert.deepEqual(readHandoff(`?${query}`, s), { text: "Prépare le devis & envoie", send: true });
  assert.equal(s.size(), 0);
  assert.deepEqual(readHandoff(`?${query}`, s), { text: "Prépare le devis & envoie", send: false });
});

test("le jeton d'un message ne fait pas partir un autre texte", () => {
  const s = store();
  const nonce = new URLSearchParams(handoffQuery("Bonjour", s)).get("n");
  assert.deepEqual(readHandoff(`?q=Supprime+tout&n=${nonce}`, s), { text: "Supprime tout", send: false });
  assert.equal(s.size(), 0, "un jeton présenté est dépensé, même avec un autre texte");
});

test("un jeton inconnu ne dépense pas celui qui attend", () => {
  const s = store();
  const query = handoffQuery("Bonjour", s);
  assert.equal(readHandoff("?q=Bonjour&n=autre", s)?.send, false);
  assert.equal(readHandoff(`?${query}`, s)?.send, true);
});

test("sans stockage, ou stockage en panne : le champ est rempli, rien ne part", () => {
  assert.equal(handoffQuery("a b", null), "q=a%20b");
  const broken = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); }, removeItem: () => undefined };
  assert.equal(handoffQuery("a", broken), "q=a");
  assert.deepEqual(readHandoff("?q=a&n=1", broken), { text: "a", send: false });
  assert.deepEqual(readHandoff("?q=a&n=1", { ...store(), getItem: () => "{pas du json" }), { text: "a", send: false });
});

test("la barre de l'accueil : sans ?q=, le message part sur le chemin du chat visé, une seule fois", () => {
  const s = store();
  assert.equal(handoffNote("Prépare le devis", "/experts/a1/aya/chat", s, 1_000), true);
  assert.equal(readHandoff("", s, "/experts/a1/autre/chat", 2_000), null, "un autre chat ne prend pas le message");
  assert.deepEqual(readHandoff("", s, "/experts/a1/aya/chat", 2_000), { text: "Prépare le devis", send: true });
  assert.equal(readHandoff("", s, "/experts/a1/aya/chat", 3_000), null, "dépensé");
});

test("une note trop vieille ne part pas et disparaît ; un ?q= garde la règle du jeton", () => {
  const s = store();
  handoffNote("Bonjour", "/experts/a1/chat", s, 0);
  assert.equal(readHandoff("", s, "/experts/a1/chat", NOTE_MS + 1), null);
  assert.equal(s.size(), 0);
  handoffNote("Bonjour", "/experts/a1/chat", s, 0);
  assert.deepEqual(readHandoff("?q=Supprime+tout", s, "/experts/a1/chat", 1), { text: "Supprime tout", send: false });
});
