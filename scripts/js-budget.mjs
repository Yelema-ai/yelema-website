#!/usr/bin/env node
// JS budget per route, read from the `.next` output of `next build` (Turbopack client reference manifests).
// Usage: `npm run budget:js` (fails when a route is over) · `npm run budget:js -- --write` (budget = now + 10 %).
import { gzipSync } from "node:zlib";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import vm from "node:vm";

const NEXT = ".next";
const BUDGET_FILE = "perf-budget.json";
const write = process.argv.includes("--write");

if (!existsSync(join(NEXT, "build-manifest.json"))) {
  console.error("Pas de .next/build-manifest.json : lancer `npm run build` d'abord.");
  process.exit(2);
}

const root = JSON.parse(readFileSync(join(NEXT, "build-manifest.json"), "utf8")).rootMainFiles ?? [];
const gz = new Map();
const sizeOf = (file) => {
  if (!gz.has(file)) gz.set(file, gzipSync(readFileSync(join(NEXT, file.replace(/^\/?_next\//, "")))).length);
  return gz.get(file);
};

function* manifests(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* manifests(p);
    else if (name === "page_client-reference-manifest.js") yield p;
  }
}

/** `/(app)/experts/[agentId]/page` → `/experts/[agentId]`. */
const routeOf = (key) => key.replace(/\/page$/, "").split("/").filter((s) => s && !/^\(.*\)$/.test(s)).join("/").replace(/^/, "/");

const sizes = {};
for (const file of manifests(join(NEXT, "server", "app"))) {
  const ctx = {};
  ctx.globalThis = ctx;
  vm.runInNewContext(readFileSync(file, "utf8"), ctx);
  for (const [key, m] of Object.entries(ctx.__RSC_MANIFEST ?? {})) {
    const route = routeOf(key);
    if (route.startsWith("/_")) continue;
    const files = new Set(root);
    for (const list of Object.values(m.entryJSFiles ?? {})) for (const f of list) files.add(f);
    sizes[route] = Math.round([...files].reduce((n, f) => n + sizeOf(f), 0) / 1024);
  }
}

const routes = Object.keys(sizes).sort();
if (write) {
  const budget = { unit: "kB gzip, JS chargé à l'ouverture de la route", default: Math.max(...Object.values(sizes)) + 20, routes: Object.fromEntries(routes.map((r) => [r, Math.ceil(sizes[r] * 1.1)])) };
  writeFileSync(BUDGET_FILE, `${JSON.stringify(budget, null, 2)}\n`);
  console.log(`${BUDGET_FILE} écrit (${String(routes.length)} routes).`);
  process.exit(0);
}

const budget = JSON.parse(readFileSync(BUDGET_FILE, "utf8"));
let over = 0;
for (const r of routes) {
  const limit = budget.routes?.[r] ?? budget.default;
  const bad = sizes[r] > limit;
  over += bad ? 1 : 0;
  console.log(`${bad ? "✖" : "✓"} ${r.padEnd(48)} ${String(sizes[r]).padStart(5)} kB / ${String(limit)} kB`);
}
console.log(over ? `\n${String(over)} route(s) au-dessus du budget (${relative(".", BUDGET_FILE)}).` : "\nToutes les routes tiennent leur budget.");
process.exit(over ? 1 : 0);
