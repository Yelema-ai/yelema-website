# Yelema

The Yelema client app: a company's team of 11 AI experts (Djénéba, Fatima, Koffi, …) plus a plain
business chat, a shared file drive, team management, connected apps and Telegram/WhatsApp. French
only. Built on [Agent37](https://www.agent37.com) Cloud; started from the Agent37 starter kit.

## How it fits together

- **One Agent37 instance per client workspace.** Each expert is a Hermes profile on it
  (`~/.hermes/profiles/<key>`); the business chat is the instance's default profile. A chat picks
  its expert with the gateway's `profile` field (gateway v0.17.0+).
- **One Supabase project for every client** (auth, workspaces, memberships, the workspace's
  agent row). All table access goes through the server with the service-role key; authorization
  is in `src/lib/auth.ts`.
- **Files** live on the instance under `~/Livrables` (each expert saves in `~/Livrables/<Prénom>`);
  the files routes refuse any other path (`src/lib/drive.ts`).
- **No public signup.** The Yelema back office creates each client (workspace, instance, expert
  profiles, first admin). Admins add teammates from Paramètres › Équipe. Access links
  (`/acces/<token>`, 7 days, one use) land on `/bienvenue` to choose a password; they are emailed
  through Resend when `RESEND_API_KEY` is set, and always shown to copy.

The expert catalog (copy, skills, suggestions) is `src/config/experts.ts`; portraits and videos are
in `public/experts`.

## Run it locally

```bash
npm install
cp .env.example .env.local   # AGENT37_API_KEY, SUPABASE_ACCESS_TOKEN, then:
npm run setup                # Supabase keys + migrations (supabase/migrations)
npm run dev
```

Set up a test workspace without the back office (creates a real instance, installs the 11
profiles, prints the admin's access link):

```bash
node scripts/provision-workspace.mjs --name "Client" --email admin@client.com [--template yelema-hermes]
```

## The instance image

Client instances run the `yelema-hermes` workspace template: the stock Agent37 Hermes image plus
the PDF tools the experts use. Its Dockerfile and rebuild steps are in `infra/yelema-hermes/`.

## Checks

`npm run typecheck && npm run build`. There is no test suite.
