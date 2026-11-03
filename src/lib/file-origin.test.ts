import assert from "node:assert/strict";
import { test } from "node:test";
import { candidateSessions, MAX_READS, wroteFile } from "./file-origin.ts";
import type { ChatHistoryMessage, SessionSummary } from "./types.ts";

const msg = (role: "user" | "assistant", content: string, files?: string[]): ChatHistoryMessage => ({ id: "m", session_id: "s", role, content, files, created_at: 0 });

test("le fichier écrit par le tour, sous toutes ses graphies", () => {
  assert.ok(wroteFile([msg("assistant", "C'est prêt.", ["Livrables/Djénéba/Plan/plan_v1.pdf"])], "~/Livrables/Djénéba/Plan/plan_v1.pdf"));
  assert.ok(wroteFile([msg("assistant", "Voici `/home/node/Livrables/Djénéba/Plan/plan_v1.pdf`.")], "~/Livrables/Djénéba/Plan/plan_v1.pdf"));
});

test("ni la demande du membre ni une autre version", () => {
  assert.equal(wroteFile([msg("user", "Reprends `~/Livrables/Djénéba/Plan/plan_v1.pdf`")], "~/Livrables/Djénéba/Plan/plan_v1.pdf"), false);
  assert.equal(wroteFile([msg("assistant", "", ["Livrables/Djénéba/Plan/plan_v2.pdf"])], "~/Livrables/Djénéba/Plan/plan_v1.pdf"), false);
});

test("actives depuis l'écriture du fichier, la plus proche d'abord", () => {
  const s = (id: string, started: number, last: number): SessionSummary => ({ id, started_at: started, last_active: last });
  const sessions = [s("avant", 100, 500), s("apres", 2_000, 2_500), s("pendant", 900, 1_100), s("tard", 1_050, 9_000)];
  assert.deepEqual(candidateSessions(sessions, 1_000_000), ["pendant", "tard"]);
});

test("last_active en millisecondes, comme Hermes le donne", () => {
  const file = 1_793_287_000_000;
  const sessions: SessionSummary[] = [{ id: "ms", last_active: file + 60_000 }, { id: "vieille", last_active: file - 86_400_000 }];
  assert.deepEqual(candidateSessions(sessions, file), ["ms"]);
});

test("sans date, les plus récentes, bornées", () => {
  const many = Array.from({ length: 20 }, (_, i): SessionSummary => ({ id: `s${String(i)}`, last_active: i }));
  const got = candidateSessions(many, null);
  assert.equal(got.length, MAX_READS);
  assert.equal(got[0], "s19");
});
