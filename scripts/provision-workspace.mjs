#!/usr/bin/env node
// Dev-only: set up a client workspace the way the back office does, so the app can be tested end
// to end without it. Idempotent: re-running finds the user, workspace and instance it made before.
//
//   node scripts/provision-workspace.mjs --name "Unifood" --email admin@unifood.ci \
//     [--logo https://…/logo.png] [--experts ../hermes-experts] [--template yelema-hermes]
//
// 1. Supabase: the admin's auth user, the workspace (+ logo) and their admin membership.
// 2. Agent37: one instance for the workspace (4 vCPU / 8 GB / 20 GB, $20 monthly cap, auto-sleep),
//    registered as the workspace's agent (agents.owner_user_id null, ready = false).
// 3. The 11 expert profiles from a local hermes-experts checkout, installed with the fixes Hermes'
//    own install lacks (memories, a config.yaml so the managed model reaches the profile, a larger
//    SOUL.md cap), the shared ~/Livrables drive, then a restart so the image writes the managed
//    model into every profile. Then agents.profiles + ready = true.
// 4. Prints the access link to send the admin (set a password, land in the app).

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./setup.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = loadEnv(path.join(ROOT, ".env.local")).map;
const get = (k) => process.env[k] || env[k];

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];

const NAME = args.name;
const EMAIL = args.email?.toLowerCase();
const LOGO = args.logo || null;
const EXPERTS_DIR = path.resolve(ROOT, args.experts || "../hermes-experts");
const TEMPLATE = args.template || "yelema-hermes";
const SITE = (get("NEXT_PUBLIC_SITE_URL") || "http://localhost:3000").replace(/\/$/, "");
const SUPABASE_URL = get("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_KEY = get("SUPABASE_SERVICE_ROLE_KEY");
const A37_KEY = get("AGENT37_API_KEY");

// The roster: Hermes profile name -> the expert's folder in the shared drive.
const EXPERTS = {
  djeneba: "Djénéba",
  fatima: "Fatima",
  koffi: "Koffi",
  kouassi: "Kouassi",
  awa: "Awa",
  adjoua: "Adjoua",
  mamadou: "Mamadou",
  salif: "Salif",
  alioune: "Alioune",
  nadia: "Nadia",
  ibrahim: "Ibrahim",
};

if (!NAME || !EMAIL) {
  console.error('Usage: node scripts/provision-workspace.mjs --name "Client" --email admin@client.com [--logo URL] [--experts DIR] [--template NAME]');
  process.exit(1);
}
for (const [k, v] of Object.entries({ NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, AGENT37_API_KEY: A37_KEY })) {
  if (!v) {
    console.error(`${k} is missing from .env.local`);
    process.exit(1);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const step = (s) => console.log(`\n▸ ${s}`);

async function request(url, init, label) {
  const res = await fetch(url, init);
  const text = await res.text();
  const body = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok) throw Object.assign(new Error(`${label}: ${res.status} ${typeof body === "string" ? body : JSON.stringify(body)}`), { status: res.status, body });
  return body;
}

const sb = (p, init = {}) =>
  request(`${SUPABASE_URL}${p}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", ...(init.headers || {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  }, `Supabase ${init.method || "GET"} ${p}`);

const a37 = (p, init = {}) =>
  request(`https://api.agent37.com/v1${p}`, {
    ...init,
    headers: { Authorization: `Bearer ${A37_KEY}`, "Content-Type": "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined,
  }, `Agent37 ${init.method || "GET"} ${p}`);

const exec = async (id, command) => {
  const r = await a37(`/instances/${id}/exec`, { method: "POST", body: { command } });
  if (r.exit_code !== 0) throw new Error(`exec failed (${r.exit_code}):\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
};

async function ensureUser() {
  try {
    const u = await sb("/auth/v1/admin/users", { method: "POST", body: { email: EMAIL, email_confirm: false } });
    return u.id;
  } catch (e) {
    if (e.status !== 422) throw e;
  }
  for (let page = 1; ; page++) {
    const { users } = await sb(`/auth/v1/admin/users?page=${page}&per_page=200`);
    const hit = users.find((u) => u.email?.toLowerCase() === EMAIL);
    if (hit) return hit.id;
    if (users.length < 200) throw new Error(`user ${EMAIL} exists but was not found`);
  }
}

async function ensureWorkspace(ownerId) {
  const found = await sb(`/rest/v1/workspaces?owner_id=eq.${ownerId}&name=eq.${encodeURIComponent(NAME)}&select=id`);
  let id = found[0]?.id;
  if (!id) {
    const [ws] = await sb("/rest/v1/workspaces", { method: "POST", body: { name: NAME, owner_id: ownerId }, headers: { Prefer: "return=representation" } });
    id = ws.id;
  }
  await sb(`/rest/v1/workspaces?id=eq.${id}`, { method: "PATCH", body: { logo_url: LOGO } });
  await sb("/rest/v1/memberships?on_conflict=workspace_id,user_id", {
    method: "POST",
    body: { workspace_id: id, user_id: ownerId, role: "admin" },
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
  });
  return id;
}

async function ensureInstance(workspaceId, ownerId) {
  const [row] = await sb(`/rest/v1/agents?workspace_id=eq.${workspaceId}&owner_user_id=is.null&select=agent37_id`);
  if (row) return row.agent37_id;
  const { data } = await a37("/instances");
  let inst = data.find((i) => i.metadata?.app_workspace === workspaceId && i.status !== "deleted");
  if (!inst) {
    inst = await a37("/instances", {
      method: "POST",
      body: {
        template: TEMPLATE,
        name: NAME,
        resources: { cpu: 4, memory: 8, disk: 20 },
        metadata: { app_workspace: workspaceId },
        budget: { monthly_cap_micros: 20_000_000 },
        auto_sleep: true,
      },
    });
    console.log(`  created instance ${inst.id}`);
  }
  await sb("/rest/v1/agents", {
    method: "POST",
    body: { agent37_id: inst.id, workspace_id: workspaceId, name: NAME, template: TEMPLATE, cpu: 4, memory: 8, disk: 20, created_by: ownerId, status: inst.status },
    headers: { Prefer: "return=minimal" },
  });
  return inst.id;
}

async function waitHealthy(id) {
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    const inst = await a37(`/instances/${id}`).catch(() => null);
    if (inst?.status === "failed") throw new Error(`instance ${id} failed: ${JSON.stringify(inst.status_reason)}`);
    if (inst?.status === "running") {
      const res = await fetch(`https://${id}.agent37.app/v1/health`, { headers: { "X-Agent37-Key": A37_KEY } }).catch(() => null);
      if (res?.ok && (await res.json()).healthy) return;
    }
    await sleep(5000);
  }
  throw new Error(`instance ${id} did not become healthy`);
}

// One archive of every expert profile, uploaded through the files API and unpacked by exec:
// one request instead of ~800 file writes.
async function uploadExperts(id) {
  for (const key of Object.keys(EXPERTS)) {
    if (!fs.existsSync(path.join(EXPERTS_DIR, key, "distribution.yaml"))) throw new Error(`no profile ${key} in ${EXPERTS_DIR}`);
  }
  const tgz = execFileSync("tar", ["czf", "-", "--exclude", ".git", "-C", EXPERTS_DIR, ...Object.keys(EXPERTS)], {
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, COPYFILE_DISABLE: "1" },
  });
  const url = `https://${id}.agent37.app/v1/files/content?path=${encodeURIComponent("~/.yelema/experts.tgz")}&overwrite=true`;
  const res = await fetch(url, { method: "PUT", headers: { "X-Agent37-Key": A37_KEY, "Content-Type": "application/octet-stream" }, body: tgz });
  if (!res.ok) throw new Error(`upload failed: ${res.status} ${await res.text()}`);
}

// Everything Hermes' `profile install` leaves out, per profile, plus the shared drive and the
// AGENTS.md every profile reads from its working directory ($HOME).
function installCommand() {
  const lines = [
    "set -e",
    'export PATH="$HOME/.local/bin:$PATH"',
    'rm -rf "$HOME/.yelema/experts" && mkdir -p "$HOME/.yelema/experts" "$HOME/Livrables"',
    'tar xzf "$HOME/.yelema/experts.tgz" -C "$HOME/.yelema/experts"',
  ];
  for (const [key, folder] of Object.entries(EXPERTS)) {
    lines.push(
      `hermes profile install "$HOME/.yelema/experts/${key}" --name ${key} --yes --force >/dev/null`,
      `d="$HOME/.hermes/profiles/${key}"; mkdir -p "$d/memories"`,
      `for f in "$HOME/.yelema/experts/${key}/memories/"*; do [ -e "$d/memories/$(basename "$f")" ] || cp "$f" "$d/memories/"; done`,
      `touch "$d/config.yaml"; grep -q '^context_file_max_chars:' "$d/config.yaml" || printf '\\ncontext_file_max_chars: 70000\\n' >> "$d/config.yaml"`,
      `mkdir -p "$HOME/Livrables/${folder}"`,
      `echo "installed ${key}"`
    );
  }
  lines.push(`cat > "$HOME/AGENTS.md" <<'EOF'\n${agentsMd()}\nEOF`);
  return lines.join("\n");
}

function agentsMd() {
  const rows = Object.entries(EXPERTS).map(([, folder]) => `- ${folder} : ~/Livrables/${folder}/`).join("\n");
  return `# Espace Yelema

Tu travailles pour l'entreprise ${NAME}. Ses fichiers sont dans ~/Livrables/ : c'est le drive que toute l'équipe voit dans l'application Yelema.

- Enregistre chaque fichier que tu produis (document, tableau, présentation, image, PDF) dans ton dossier, avec un nom clair. Si tu es l'un des experts ci-dessous, ton dossier est le tien ; sinon, enregistre directement dans ~/Livrables/.
${rows}
- Les documents de l'entreprise sont dans ~/Livrables/ : lis-y les fichiers qu'on te cite.
- Quand tu as enregistré un fichier, donne son chemin complet dans ta réponse.
- Ne range rien ailleurs que dans ~/Livrables/ : le reste n'est pas visible par l'équipe.`;
}

async function accessLink() {
  let type = "invite";
  let r = await sb("/auth/v1/admin/generate_link", { method: "POST", body: { type, email: EMAIL, redirect_to: SITE } }).catch((e) => e);
  if (r instanceof Error) {
    if (r.status !== 422) throw r;
    type = "recovery";
    r = await sb("/auth/v1/admin/generate_link", { method: "POST", body: { type, email: EMAIL, redirect_to: SITE } });
  }
  const q = new URLSearchParams({ token_hash: r.hashed_token, type, next: "/bienvenue" });
  return `${SITE}/auth/callback?${q}`;
}

async function main() {
  step(`Supabase: ${EMAIL} and workspace "${NAME}"`);
  const userId = await ensureUser();
  const workspaceId = await ensureWorkspace(userId);
  console.log(`  user ${userId}\n  workspace ${workspaceId}`);

  step(`Agent37 instance (template ${TEMPLATE})`);
  const id = await ensureInstance(workspaceId, userId);
  console.log(`  instance ${id}, waiting until healthy…`);
  await waitHealthy(id);

  step(`Installing ${Object.keys(EXPERTS).length} expert profiles from ${EXPERTS_DIR}`);
  await uploadExperts(id);
  console.log((await exec(id, installCommand())).trim().replace(/^/gm, "  "));

  step("Restarting so every profile gets the managed model");
  await a37(`/instances/${id}/restart`, { method: "POST" });
  await sleep(10_000);
  await waitHealthy(id);
  const check = await exec(id, `grep -L "^model:" $HOME/.hermes/profiles/*/config.yaml || true`);
  if (check.trim()) throw new Error(`profiles without a model after restart:\n${check}`);

  await sb(`/rest/v1/agents?agent37_id=eq.${id}`, {
    method: "PATCH",
    body: { profiles: Object.keys(EXPERTS), ready: true, status: "running" },
  });

  step("Done. Send this link to the admin (valid 24 h, one use):");
  console.log(`\n  ${await accessLink()}\n`);
}

main().catch((e) => {
  console.error(`\n✗ ${e.message}`);
  process.exit(1);
});
