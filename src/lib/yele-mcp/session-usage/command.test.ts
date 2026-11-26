import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { type Exec, runPythonReader } from "../python-reader.ts";
import { sessionUsageReader } from "./command.ts";
import { parseSessionUsageByProfile, type ProfileReading } from "./usage.ts";

const hasPython = (() => {
  try {
    execFileSync("python3", ["-c", "import sqlite3"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

test("lecteur des sessions, avec python3 : un state.db inchangé n'est pas relu, un state.db modifié l'est", { skip: !hasPython }, async () => {
  const home = mkdtempSync(join(tmpdir(), "yelema-usage-"));
  try {
    const db = (profile: string) => join(home, ".hermes", "profiles", profile, "state.db");
    const sql = (profile: string, statements: string) => execFileSync("python3", ["-c", "import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);c.executescript(sys.argv[2]);c.commit()", db(profile), statements]);
    const now = Math.floor(Date.now() / 1000);
    for (const profile of ["koffi", "awa"]) {
      mkdirSync(join(home, ".hermes", "profiles", profile), { recursive: true });
      sql(profile, `CREATE TABLE sessions (id TEXT, started_at REAL, ended_at REAL, source TEXT, model TEXT, message_count INT, input_tokens INT); INSERT INTO sessions VALUES ('s1', ${now - 60}, ${now}, 'telegram', 'm', 3, 100);`);
    }
    const exec: Exec = (command) =>
      new Promise((resolve) => {
        execFile("bash", ["-c", command], { env: { ...process.env, HOME: home }, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => resolve({ exit_code: error ? 1 : 0, stdout, stderr, truncated: false }));
      });
    const read = async (known: Map<string, ProfileReading>) => {
      const reader = sessionUsageReader(Object.fromEntries([...known].map(([p, r]) => [p, r.stamp])));
      let raw = "";
      const parsed = await runPythonReader(exec, reader.script, reader.params, (json) => ((raw = json), parseSessionUsageByProfile(json, known)));
      return { ...parsed, raw: JSON.parse(raw) as { profiles: { name: string; same?: boolean }[] } };
    };
    const sessionsOf = (u: { usage: { totals: { profile: string; sessions: number }[] } }) => Object.fromEntries(u.usage.totals.map((t) => [t.profile, t.sessions]));

    const first = await read(new Map());
    assert.deepEqual(sessionsOf(first), { koffi: 1, awa: 1 });
    assert.ok(first.raw.profiles.every((p) => !p.same));

    const second = await read(first.readings);
    assert.ok(second.raw.profiles.every((p) => p.same), "rien n'a changé : aucun state.db relu");
    assert.deepEqual(second.usage, first.usage);

    sql("awa", `INSERT INTO sessions VALUES ('s2', ${now - 30}, ${now}, 'telegram', 'm', 1, 5);`);
    const third = await read(second.readings);
    assert.deepEqual(third.raw.profiles.map((p) => [p.name, Boolean(p.same)]).sort(), [["awa", false], ["koffi", true]]);
    assert.deepEqual(sessionsOf(third), { koffi: 1, awa: 2 });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
