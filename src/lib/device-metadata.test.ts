import assert from "node:assert/strict";
import { test } from "node:test";
import { eraseMetadata } from "./device-metadata.ts";

function store(entries: Record<string, string>) {
  const m = new Map(Object.entries(entries));
  return { get length() { return m.size; }, key: (i: number) => [...m.keys()][i] ?? null, removeItem: (k: string) => void m.delete(k), keys: () => [...m.keys()].sort() };
}

test("🔒 déconnexion : ce qui parle du compte part, les préférences de l'appareil restent", () => {
  const s = store({
    "agent37wl_workspace": "w1",
    "yele-session:abc": "s1",
    "yelema.activity.abc": "{}",
    "yelema.documents-noms": "{\"doc\":\"Budget 2027\"}",
    "yelema.documents-epingles.abc:awa:s1": "[]",
    "yelema:tableau-auto:abc:awa": "1",
    "yelema.q": "{}",
    "yelema:channels:abc": "{\"channels\":[]}",
    "yelema:latence": "[]",
    "yelema:rail-folded": "{}",
    "yap": "dark",
    "yelema.chat.list-hidden": "1",
    "yelema.notify-prefs": "{}",
    "yelema-voice": "{}",
  });
  eraseMetadata(s, null, undefined);
  assert.deepEqual(s.keys(), ["yap", "yelema-voice", "yelema.chat.list-hidden", "yelema.notify-prefs", "yelema:rail-folded"]);
});

test("un stockage refusé n'arrête pas l'effacement des autres", () => {
  const broken = { get length(): number { throw new Error("refusé"); }, key: () => null, removeItem: () => undefined };
  const s = store({ "yele-session:abc": "s1" });
  eraseMetadata(broken, s);
  assert.deepEqual(s.keys(), []);
});
