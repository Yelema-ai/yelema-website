import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { OUTPUT_MARKER, script } from "./hermes-script.ts";

const SECRET = "123456:AA-jeton-de-bot'; rm -rf ~";

describe("script d'un appel aux canaux de l'instance", () => {
  it("avec un fichier, aucun identifiant dans la commande ; le fichier est fermé puis retiré", () => {
    const cmd = script("PUT", "/api/messaging/platforms/telegram", { env: { TELEGRAM_BOT_TOKEN: SECRET } }, "$HOME/.yelema/.channel-abc.json");
    assert.ok(!cmd.includes("jeton-de-bot"));
    assert.ok(cmd.includes(`--data-binary @"$HOME/.yelema/.channel-abc.json"`));
    assert.ok(cmd.startsWith(`trap 'rm -f "$HOME/.yelema/.channel-abc.json"' EXIT\nchmod 600 "$HOME/.yelema/.channel-abc.json"`));
    assert.ok(cmd.includes(OUTPUT_MARKER));
  });

  it("sans fichier, le corps reste une seule valeur entre apostrophes", () => {
    const cmd = script("PUT", "/p", { v: SECRET });
    assert.ok(cmd.includes(`-d '{"v":"123456:AA-jeton-de-bot'\\''; rm -rf ~"}'`));
  });

  it("la méthode et le chemin sont entre apostrophes ; une lecture n'a pas de corps", () => {
    const cmd = script("GET; id", "/api/x/a'b");
    assert.ok(cmd.includes(`-X 'GET; id' `));
    assert.ok(cmd.includes(`'http://127.0.0.1:9119/api/x/a'\\''b'`));
    assert.ok(!cmd.includes("content-type") && !cmd.includes("trap"));
  });
});
