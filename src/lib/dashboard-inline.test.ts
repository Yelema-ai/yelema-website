import assert from "node:assert/strict";
import { test } from "node:test";
import { inlineDashboard, resolveBeside } from "./dashboard-inline.ts";

test("a reference is read from the page's folder, never above the drive nor from the web", () => {
  const page = "~/Livrables/Kouassi/tableau/index.html";
  assert.equal(resolveBeside(page, "tdb.css"), "~/Livrables/Kouassi/tableau/tdb.css");
  assert.equal(resolveBeside(page, "./img/logo%20cfao.png?v=2"), "~/Livrables/Kouassi/tableau/img/logo cfao.png");
  assert.equal(resolveBeside(page, "../commun/app.css"), "~/Livrables/Kouassi/commun/app.css");
  assert.equal(resolveBeside(page, "../../../../etc/passwd"), null);
  assert.equal(resolveBeside(page, "https://fonts.googleapis.com/css2"), null);
  assert.equal(resolveBeside(page, "data:image/png;base64,AA"), null);
  assert.equal(resolveBeside(page, "/abs.png"), null);
});

test("stylesheets, pictures and fonts beside the page end up inside it", async () => {
  const files: Record<string, string> = {
    "~/Livrables/K/tdb.css": "@font-face{src:url(img/Funnel.woff2)} .x{background:url('img/fond.png')}",
    "~/Livrables/K/img/Funnel.woff2": "F",
    "~/Livrables/K/img/fond.png": "P",
    "~/Livrables/K/img/kouassi.jpg": "J",
  };
  const read = async (p: string) => (p in files ? new TextEncoder().encode(files[p]) : null);
  const html = '<link rel="stylesheet" href="tdb.css"><link rel="icon" href="x.ico"><img class="xp" src="img/kouassi.jpg" alt=""><img src="img/absent.png"><img src="https://a.b/c.png">';
  const out = await inlineDashboard(html, "~/Livrables/K/index.html", read);
  assert.match(out, /<style>@font-face\{src:url\("data:font\/woff2;base64,Rg=="\)\}/);
  assert.match(out, /url\("data:image\/png;base64,UA=="\)/);
  assert.match(out, /<img class="xp" src="data:image\/jpeg;base64,Sg=="/);
  assert.match(out, /<img src="img\/absent.png">/);
  assert.match(out, /<img src="https:\/\/a.b\/c.png">/);
  assert.match(out, /<link rel="icon" href="x.ico">/);
});
