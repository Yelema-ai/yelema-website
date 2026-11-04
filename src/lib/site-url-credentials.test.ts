import assert from "node:assert/strict";
import { test } from "node:test";
import { STRIP_CREDENTIALS_BOOTSTRAP } from "./site-url.ts";

function run(href: string): string | null {
  const parsed = new URL(href);
  let replaced: string | null = null;
  const location = { href, username: parsed.username, password: parsed.password, replace: (to: string) => (replaced = to) };
  new Function("location", STRIP_CREDENTIALS_BOOTSTRAP)(location);
  return replaced;
}

test("a page opened with credentials reloads without them, path and query kept", () => {
  assert.equal(run("https://u:p@mstudio.app.yelema.ai/login?next=%2F#x"), "https://mstudio.app.yelema.ai/login?next=%2F#x");
  assert.equal(run("https://u@mstudio.app.yelema.ai/"), "https://mstudio.app.yelema.ai/");
});

test("a normal address is left alone", () => {
  assert.equal(run("https://mstudio.app.yelema.ai/experts"), null);
});
