# AGENTS.md

Guidance for AI coding agents (and humans) working in the **Agent37 Starter Kit**.
`CLAUDE.md` imports this file via `@AGENTS.md`, so this is the single source of
truth — edit here, not there.

## First-time setup

Setting this up from a fresh clone? Follow **[`SETUP.md`](SETUP.md)** — the complete runbook
(it's what the README tells adopters to hand you). Two login-gated secrets are human-supplied:
`AGENT37_API_KEY` (plus a **funded** Agent37 wallet) and `SUPABASE_ACCESS_TOKEN`;
`npm run setup` does the rest. Never print or commit the `sk_live_` key.

## What this project is

A full-stack starter for building your own agent app, built entirely on top of the
public **[Agent37](https://www.agent37.com) B2B Agents API**: email + password auth
(open signup, no verification), a multi-agent fleet, and, for each agent, native
in-dashboard **Chat**, a **Files** browser, **Messaging** (connect the agent to
Telegram, WhatsApp, Slack, Discord and two dozen more), **Integrations** (Composio),
and a **Settings** tab. Forkers rebrand it (`src/config/branding.ts`) and ship it; their
end users sign up, get workspaces, invite teammates, and create / manage agents.

Everything this app can do is a **subset of the Agent37 `/v1` API** — control plane
*and* data plane. This repo is a *client* of that API — it does not implement agent
infrastructure itself. So **the API docs, not this code, are the authority on what an
agent can and cannot do.**

## The API this is built on — read the docs first

This product is built on top of our public API. **Before adding or changing any
agent capability, consult the docs** — they define the full surface and its
limits. Two machine-readable entry points are designed for you (an AI agent) to
fetch directly:

- **<https://www.agent37.com/docs/llms.txt>** — concise index of every doc page.
  *Start here* to find the right page.
- **<https://www.agent37.com/docs/llms-full.txt>** — the entire documentation
  inlined into one file. Use for deep reference.
- Human-browsable docs: **<https://www.agent37.com/docs>**
  (append `.md` to any page URL to get raw markdown.)

### Documented capability map

Two planes, one `sk_live_` key — and this template now drives **both**. The
**control plane** manages instances (and the per-agent Composio integrations); the
**data plane** powers the native Chat and Files tabs.

**Control plane — `https://api.agent37.com/v1/*`** (the `sk_live_` key this app holds):

| Page | Covers | Used here |
|---|---|---|
| [Core concepts](https://www.agent37.com/docs/agents-api/concepts) | the model, auth, the two planes | read first |
| [Instances](https://www.agent37.com/docs/agents-api/instances) | create / list / get / start / stop / restart / update / resize / delete | ✅ |
| [Instance URLs](https://www.agent37.com/docs/agents-api/urls) | short-lived signed URLs to open an agent's ports | ✅ |
| [Templates](https://www.agent37.com/docs/agents-api/templates) | the agent images you can provision | ✅ |
| [Managed services & budgets](https://www.agent37.com/docs/agents-api/budgets) | per-agent managed-spend cap | ✅ |
| [Billing](https://www.agent37.com/docs/agents-api/billing) | wallet, compute prepay, usage | ✅ (usage) |
| [Run commands](https://www.agent37.com/docs/agents-api/exec) | exec a command inside an instance | ✅ (Messaging) |
| [Errors](https://www.agent37.com/docs/agents-api/errors) | machine-readable error codes | ✅ (mapped in `Agent37Error`) |

The **Integrations** tab is also control plane: it manages a per-agent Composio
entity through `/instances/{id}/integrations/*` (toolkits / connect / connections).

The **Messaging** tab is control plane too, but through `exec`: messaging channels are
configured *inside* the agent, not by our API, so the tab drives the agent's own
messaging API (loopback port `9119`) over `POST /v1/instances/{id}/exec`. The agent
reports the channel catalog, each channel's fields, and its live connection state, so
the UI renders a form it did not write and a channel a later image adds needs no change
here. See [Messaging channels](https://www.agent37.com/docs/agents-api/messaging).

**Data plane — `https://{instanceId}.agent37.app/v1/*`** (talk to one agent's
gateway). Data-plane requests authenticate with the `X-Agent37-Key: sk_live_...`
header (raw key, no Bearer prefix; `Authorization` passes through to the app inside
the instance), while the control plane stays `Authorization: Bearer`. The native
**Chat** and **Files** tabs call these endpoints directly
(through this app's BFF). The signed-URL "open in new tab" shortcuts still exist
too — they just complement the in-dashboard UIs now rather than replace them:

| Page | Covers | Used here |
|---|---|---|
| [Send a message](https://www.agent37.com/docs/agents-api/chat) | post a message, get a response (`/v1/responses`) | ✅ (Chat) |
| [Streaming](https://www.agent37.com/docs/agents-api/streaming) | stream responses (SSE) | ✅ (Chat) |
| [Sessions & models](https://www.agent37.com/docs/agents-api/sessions) | conversation state, model selection | ✅ (Chat) |
| [Files](https://www.agent37.com/docs/agents-api/files) | list / read / write / archive files | ✅ (Files) |
| [Build a chat app](https://www.agent37.com/docs/agents-api/chat-app) | end-to-end guide for a chat UI | reference |

So: **what's possible** = the whole map above, and this template now exercises most
of it: the control-plane rows marked ✅, the native data-plane Chat and Files tabs,
the per-agent Integrations tab, *and* the signed-URL buttons that open each agent's
own dashboard / terminal / files UI in a new tab.

## How this app fits together

```
Browser ─▶ Next.js (this app) ─▶ control plane  https://api.agent37.com/v1   (instances, integrations)
   │            │              └▶ data plane     https://{instance}.agent37.app/v1   (chat, files)
   │            │                                 (one server-side sk_live_ key, both planes:
   │            │                                  Bearer on the control plane, X-Agent37-Key on the instance)
   │            │
   │            └─▶ Supabase: Auth (browser, anon key) + Postgres (server-only, service-role key):
   │                          users, workspaces, members, agent mirror
   │
   └──────────────▶ https://{instance}.agent37.app  (agent's own UI, via short-lived signed URLs)
```

- **One key, many app workspaces.** A single `sk_live_` key, server-side only, is
  shared by the whole app. Every agent is created under your one Agent37 workspace
  and tagged `metadata.app_workspace`; a Supabase mirror table is the source of
  truth for which app-workspace owns which agent.
- **Isolation is enforced in the server (BFF), not in the browser.** Clients have **no**
  direct table access — the schema migration (`0001_init.sql`) grants tables only to the
  service role, so the browser only uses Supabase for *auth*. Every read and write
  goes through `src/app/api/**` using the **service-role** client (`src/lib/supabase/admin.ts`,
  which bypasses RLS); the TypeScript checks in `src/lib/auth.ts` (`requireUser` /
  `requireMember` / `requireAdmin` / `requireAgentAccess`) are the authorization boundary. RLS
  policies stay enabled as a backstop but are dormant (clients can't reach the tables). Neither
  the `sk_live_` key nor the service-role key ever reaches the browser.
- **Yelema fork: one client per deployment, roles, one agent per member.** The back-office creates
  the deployment's single workspace and its admin; there is no open sign-up (only on the way to an
  invitation) and no workspace creation or deletion (`403`). Roles are `admin` and `member`
  (`0002_roles_owner.sql`); an admin sees the members list, and like any member reaches only
  their OWN agent and its experts. The back-office creates every member and
  their agent, one per member (`agents.owner_user_id`, unique index); the app creates neither.
  All clients share ONE Supabase project: `WORKSPACE_ID` pins a deployment to its workspace and
  `getRole` answers null for any other (`docs/decisions/supabase-projet-partage.md`), so
  migrations must stay additive. `requireAgentAccess` lets in the
  agent's OWNER only — anyone else, workspace admins included, gets a `404`; `"admin"` access
  (resize, budget) is the owner again, and only if they are an admin. Configuration is read at runtime (`src/lib/runtime-config.ts`).
- **`src/lib/agent37.ts` is the only thing that calls the Agent37 API**
  (`server-only`) — both the control-plane base and each instance's data-plane host.
  Internal `src/app/api/**` routes are this app's BFF: the browser calls them, they
  authenticate + check workspace ownership in TS, then call `agent37.ts` and/or the DB via the
  service-role client. The browser never calls the upstream API or the DB directly.
- **The UI is one shell around the member's experts.** An **expert** is a Hermes profile
  (`client__expert`) installed on the member's instance. The shell (`src/components/app`) lists
  them; `/` is the home, `/recruter` the gallery of every expert Yelema offers, and
  `/experts/{agentId}/{profileId}/{tab}` the expert's workspace (Discussion / Livrables /
  Routines / Canaux / Connecteurs). Without a profile segment the page is the
  instance's default Hermes home. Administration (`/administration`) is two read-only lists: the workspace's
  members, and for admins its instances by name and member (no id, no state, no way in). The app
  creates neither members nor agents.
- **Two ways to know the user, one switch.** With `AUTH_VIA_BACKOFFICE=true` the Yelema back office
  signs users in and says what they see (`/api/v1/app/*`, `src/lib/backoffice.ts`): the session is
  one httpOnly cookie (`src/lib/session.ts`), renewed by the proxy, and the user's role, workspace,
  instance and installed experts come from the back office on every read, so a suspended member or
  client is stopped there. Without the switch the app uses Supabase Auth and its own tables. The
  helpers in `src/lib/auth.ts` carry both branches; routes do not know which is on.
- **Talking to an expert is the Agent37 API's `profile`**, not an image feature: `profile` on
  `POST /v1/responses` and `?profile=` on every session read, sent on EVERY turn. The profile is
  checked against what is installed on that instance (`src/lib/profiles.ts`), never a fixed list.
- **Nothing about experts is written in this repo.** Names, roles, photos, sheets come from the
  back office's public catalogue (`BACKOFFICE_URL`, `src/lib/catalogue.ts`), joined to installed
  profiles by the part of the profile name after `__`. Which experts a member HAS is what is
  installed (`agents.profiles`, written by the back office; the instance itself as a fallback).
- **The drive is `~/Livrables` on the member's instance**, and every files route refuses a path
  outside it (`src/lib/drive.ts`): the files API can otherwise read `~/.hermes` and `~/.yelema`.
- **Connectors belong to the member.** An instance wired by the back office
  (`agents.apps_token_hash`) uses Yelema's own Composio under its owner's identity, and its
  experts reach their tools through `/api/composio-mcp`; any other instance keeps Agent37's
  managed Composio (`src/lib/integrations.ts`).
- **Naming:** the upstream API calls these resources **instances**; this app brands
  them **agents**. Paths stay `/instances`; the client methods read `agent…`.

## Where things live

| Path | What |
|---|---|
| `src/lib/agent37.ts` | The Agent37 `/v1` client — the single egress to both planes |
| `src/app/api/**` | This app's own API routes (BFF); enforce auth + ownership |
| `src/app/api/agents/[id]/{chat,files}/**` | Data-plane BFF: native Chat + Files proxied to the instance |
| `src/app/api/agents/[id]/integrations/**` | Connecteurs BFF: Yelema's Composio or Agent37's managed one, per instance (`src/lib/integrations.ts`) |
| `src/lib/composio.ts`, `src/app/api/composio-mcp/` | Yelema's Composio (server-only key) and the experts' tool proxy; identity = the instance's owner |
| `src/lib/profile-id.ts`, `src/lib/profiles.ts` | The profile a chat targets: shape, `?profile=`, and the check against the instance's real profiles |
| `src/lib/backoffice.ts`, `src/lib/session.ts`, `src/app/api/auth/**` | Sign-in through the back office: its client, the cookie session, and the login / logout / forgot / accept routes |
| `src/lib/catalogue.ts`, `src/app/api/catalogue/**` | The back office's expert catalogue, cached, and its join with installed profiles |
| `src/components/experts/ExpertImage.tsx`, `images` in `next.config.ts` | Expert pictures resized by the image optimizer (the catalogue serves them full size); only Yelema hosts are optimized |
| `src/lib/installed-experts.ts`, `src/app/api/experts/` | The profiles installed on the instances a user can see |
| `src/lib/drive.ts`, `src/lib/drive-paths.ts` | The drive (`~/Livrables`) and the path guard every files route applies |
| `src/lib/hermes-cron.ts`, `src/app/api/agents/[id]/routines/**` | Routines: Hermes's scheduler through its API server (port 8642, `yelema-hermes` image) |
| `src/components/home`, `src/components/experts`, `src/components/integrations` | Home, gallery, sheet, routines, connectors |
| `src/app/api/agents/[id]/computer/`, `src/components/experts/ComputerProvider.tsx`, `ExpertComputer.tsx` | "Son ordinateur": the instance's screen live beside the chat (noVNC, 60-second signed URL), and taking over mouse and keyboard |
| `src/app/api/agents/[id]/channels/**` | Messaging channels BFF (list / write / disconnect, Telegram checks, WhatsApp pairing) |
| `src/lib/hermes-messaging.ts` | The agent's own messaging API, reached over `exec`; the only module that speaks it |
| `src/lib/telegram.ts` | Telegram Bot API calls made BEFORE anything is written into the agent (token check, owner lookup) |
| `src/lib/channels.ts` | Channel types + the featured list, shared by the BFF and the Messaging tab |
| `src/components/channels/**` | The Messaging tab: channel list, Telegram flow, WhatsApp QR, generic credentials form |
| `src/app/(app)/experts/[agentId]/[[...onglet]]/`, `src/lib/expert-tabs.ts` | The expert workspace route and its URL grammar (instance, profile, tab) |
| `src/config/agents.ts` | `SHAPE_PRESETS`, `DEFAULT_AGENT`, the `AGENT_TYPES` catalog, `PORT_LABELS` (labels only), and `templateAppPorts` — the per-template openable app ports (the API no longer reports per-instance ports) |
| `src/config/branding.ts` | `appName` / `logoUrl` code constants (branding lives here, not in env) |
| `src/lib/types.ts` | App + upstream `/v1` types |
| `supabase/migrations/0001_init.sql` | Schema, RLS policies (dormant backstop), SECURITY DEFINER RPCs; grants tables to the service role only (clients have no direct DB access) |
| `supabase/migrations/0003_agent_backoffice_columns.sql` | Columns the back office fills on `agents`: `profiles`, `ready`, `apps_token_hash` |
| `docs/plans/experts-profils-vercel.md` | The current plan and the contract with the back office |
| `src/lib/supabase/admin.ts` | Service-role client (server-only, bypasses RLS) — the DB egress |
| `scripts/setup.mjs` | One-command Supabase setup (`npm run setup`) |

## Commands

```bash
npm install
npm run setup       # configure Supabase end-to-end (idempotent; needs SUPABASE_ACCESS_TOKEN)
npm run dev         # http://localhost:3000
npm run build
npm run typecheck   # tsc --noEmit
```

There is no test suite; the gate before shipping is a clean `npm run typecheck`
and `npm run build`. Setup is "paste two keys + `npm run setup`" — no manual
dashboard steps.

## Custom agent image (out of scope here)

Nothing here builds or pushes an agent image. Yelema's agent image lives in its own repo,
**`Yelema-ai/yelema-hermes`**, with a `versions.json` registry the back office reads to pin each
instance. This app only relies on what that image provides: the `apps` tool server wired from
`~/.yelema/apps-mcp.json` (Connecteurs) and Hermes's API server on port 8642 with its key in
`~/.yelema/api-server-key` (Routines), and the screen streamed on port 6901 ("Son ordinateur",
image v1.1.0 and later). Chat by profile needs no custom image.

The root `Dockerfile` builds **this app** for the older per-client containers (see
`docs/plans/yelema-single-tenant.md`). New clients run on Vercel, one project per client, deployed
by the back office from a git tag (`vercel.json` turns automatic deployments off). The Dockerfile
goes away once every client is on Vercel.

- [Build a custom image](https://www.agent37.com/docs/agents-api/custom-image) — the guide.

## House rules

- **The API is the final authority.** Shapes, disks, templates, budgets — the
  `/v1` API can reject anything your account's tier disallows, regardless of what
  `src/config` lists. Check the docs before assuming a capability exists.
- **Never expose `AGENT37_API_KEY` to the browser.** It stays server-side; all
  agent calls go through `src/app/api/**` → `src/lib/agent37.ts`.
- **A messaging channel is a door into the agent, so fill its allowlist.** Every channel
  takes an allowed-users field; empty means anyone who finds the bot reaches the agent,
  its files, and its connected accounts. The Telegram flow learns the owner from the
  first message sent to the bot rather than asking for a numeric id nobody knows.
- **Check a channel credential before writing it** where the provider lets you (Telegram's
  `getMe`). The agent's messaging gateway refuses to start on a bad token, which takes
  every other channel on that agent down with it.
- **A file path from the browser is checked before it reaches the instance** (`assertInDrive`).
  Server code that must read outside the drive (the routines key file) does so itself, never
  through a path the caller supplied.
- **A member never reaches the instance's own dashboard, terminal or files UI.** There is no
  settings tab and no route that mints a signed URL for an arbitrary port; running the instance is
  Yelema's job, from the back office. The one exception is "Son ordinateur", whose route signs
  the screen's port only.
- **The app cannot act on an instance.** No route starts, stops, restarts, updates, resizes or
  re-budgets one, and `src/lib/agent37.ts` no longer has those calls: the app holds Yelema's
  workspace-wide key, so any such route would let a signed-in user change an instance behind the
  back office's back.
- **The app never changes an instance's sleep or size.** The back office creates each member's
  instance (2 vCPU, auto-sleep after 45 idle minutes). A sleeping instance wakes on any request
  from the app, but hears no Telegram/WhatsApp message and runs no Hermes routine until then.
- **"Son ordinateur" hands out full control of the instance.** The signed URL for the screen lets
  its holder click and type on the member's machine and cannot be revoked: it is minted only for
  the instance's owner, for 60 seconds, and never logged.
- **Payments are intentionally excluded.** Add Stripe (or anything) yourself when
  you're ready to charge your own customers — the create route (`src/app/api/agents/route.ts`)
  has a commented `canCreateAgent()` seam marking where an entitlement gate would go.
- **Branding lives in `src/config/branding.ts`** (`appName` / `logoUrl` constants),
  not in env. The old `NEXT_PUBLIC_APP_NAME` / `NEXT_PUBLIC_LOGO_URL` vars are gone;
  keep it code-side.
- Keep changes small and focused; don't add unrequested features or touch
  unrelated code.
