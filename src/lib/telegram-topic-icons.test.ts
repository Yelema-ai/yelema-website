import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { TOPIC_ICONS, TOPIC_ICONS_PY } from "./telegram-topic-icons.ts";

// telegram-topics.ts is server-only: its embedded script is read from the source (no other interpolation in it).
const source = readFileSync(new URL("./telegram-topics.ts", import.meta.url), "utf8");
const ADD_PROFILE_ROUTE_PY = source.split("ADD_PROFILE_ROUTE_PY = `")[1]!.split("\n`;")[0]!.replace("${TOPIC_ICONS_PY}", TOPIC_ICONS_PY);
const [christelle, allowed] = TOPIC_ICONS.djeneba!;
const refused = { ok: false, error_code: 400, description: "Bad Request: invalid custom emoji identifier specified" };

test("Christelle's icon then an allowed one per expert (Yélé: allowed only), readable as a Python dict", () => {
  const experts = ["adjoua", "alioune", "awa", "djeneba", "fatima", "fatou", "ibrahim", "koffi", "kouassi", "mamadou", "nadia", "salif", "yele"];
  assert.deepEqual(Object.keys(TOPIC_ICONS).sort(), experts);
  const ids = Object.values(TOPIC_ICONS).flat().filter((id) => id !== null);
  assert.equal(new Set(ids).size, 25);
  assert.ok(ids.every((id) => /^\d{19}$/.test(id)));
  assert.deepEqual(JSON.parse(TOPIC_ICONS_PY).djeneba, [christelle, allowed]);
  assert.deepEqual(JSON.parse(TOPIC_ICONS_PY).yele, [TOPIC_ICONS.yele![1]]);
});

// Runs the script's create_forum_topic against a stub `requests` answering `replies` in order.
function createTopic(replies: unknown[]): { icons: (string | undefined)[]; out: string } {
  const dir = mkdtempSync(join(tmpdir(), "topic-icons-"));
  mkdirSync(join(dir, "ruamel"));
  writeFileSync(join(dir, "ruamel", "__init__.py"), "");
  writeFileSync(join(dir, "ruamel", "yaml.py"), "class YAML: pass\n");
  writeFileSync(join(dir, "requests.py"), `import json, os
CALLS, REPLIES = [], json.loads(os.environ["REPLIES"])
class R:
    status_code = 200
    def __init__(self, d): self.d = d
    def json(self): return self.d
def post(url, json=None, timeout=None):
    CALLS.append(json)
    return R(REPLIES.pop(0))
`);
  writeFileSync(join(dir, "route.py"), ADD_PROFILE_ROUTE_PY);
  const run = `import json, requests, route
try:
    print("thread", route.create_forum_topic("t", "-100", "djeneba", route.icons_for("djeneba")))
except RuntimeError as e:
    print("error", e)
print(json.dumps([c.get("icon_custom_emoji_id") for c in requests.CALLS]))`;
  const r = spawnSync("python3", ["-c", run], { cwd: dir, env: { ...process.env, PYTHONPATH: dir, REPLIES: JSON.stringify(replies) }, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const lines = r.stdout.trim().split("\n");
  return { icons: JSON.parse(lines.at(-1)!).map((i: string | null) => i ?? undefined), out: lines[0]! };
}

const python = spawnSync("python3", ["--version"]).status === 0;
const ok = { ok: true, result: { message_thread_id: 7 } };

test("topic created with Christelle's icon", { skip: !python }, () => {
  assert.deepEqual(createTopic([ok]), { icons: [christelle], out: "thread 7" });
});

test("Christelle's icon refused: the allowed icon", { skip: !python }, () => {
  assert.deepEqual(createTopic([refused, ok]), { icons: [christelle, allowed], out: "thread 7" });
});

test("both icons refused: topic without icon", { skip: !python }, () => {
  assert.deepEqual(createTopic([refused, refused, ok]), { icons: [christelle, allowed, undefined], out: "thread 7" });
});

test("retry later (429): no further attempt, the error surfaces", { skip: !python }, () => {
  const { icons, out } = createTopic([{ ok: false, error_code: 429, description: "Too Many Requests: retry after 5" }]);
  assert.deepEqual(icons, [christelle]);
  assert.match(out, /^error Too Many Requests/);
});
