# Plan : kit Yelema « un client par déploiement »

> Pendant de `yelema-platform/docs/plans/agent37-espaces-dedies.md` (mise en service depuis le
> back-office). Branche prévue : `feat/yelema-single-tenant`. Rédigé le 2026-09-30.
> **STATUS : validé le 2026-09-30 — en cours d’exécution (A → B → C → D).**

## 1. Objectif

Transformer ce fork en **une image Docker générique** que le back-office Yelema démarre une fois par
client, avec la configuration de ce client injectée **au démarrage** (jamais au build). Un
déploiement = une organisation : pas d'inscription libre, pas de choix de workspace, un branding
Yelema commun.

## 2. Contrat avec le back-office (à ne pas casser)

| Élément | Forme |
|---|---|
| Image | `agent37-app:vX.Y.Z` (linux/amd64), port `3000`, utilisateur non-root |
| Variables lues au runtime | `AGENT37_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SITE_URL`, `BRAND_LOGO_URL` (optionnelle) |
| Santé | `GET /api/health` → `200 { ok: true, version }` sans secret |
| Schéma | `supabase/migrations/*.sql` de la version, copiés par le back-office dans `assets/agent37-app/<version>/` |
| Données initiales | le back-office crée l'admin (Auth) et **la** ligne `workspaces` ; l'app ne crée plus de workspace |
| Accès | lien `/auth/callback?token_hash=…&type=invite&next=/reset-password` (déjà géré par la route existante) |

## 3. Changements

1. **Image Docker**
   - `next.config.ts` : `output: "standalone"`.
   - `Dockerfile` multi-étapes : `deps` (`npm ci`) → `build` (`next build`, `APP_VERSION` en build-arg) → runtime `node:22-alpine` avec seulement `.next/standalone`, `.next/static`, `public`, `USER node`. Cible ~150–200 Mo.
   - `.dockerignore` (`node_modules`, `.next`, `.env*`, `screenshots`, `docs`).
   - `AGENTS.md` : la section « There is no Docker in this repo » vise l'image **d'agent** ; la reformuler (le Dockerfile de l'app est désormais attendu).

2. **Configuration lue au runtime** (bloquant pour une image unique)
   - Aujourd'hui `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` / `NEXT_PUBLIC_SITE_URL` sont **inlinées au build**, y compris côté serveur.
   - Nouveau `src/lib/runtime-config.ts` (server-only) : lit `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SITE_URL`, `BRAND_LOGO_URL`, avec repli sur les anciens noms `NEXT_PUBLIC_*` pour le dev local.
   - `src/app/layout.tsx` : passe la config publique (URL, clé anon, logo) au navigateur via un provider ; rendu dynamique (sinon le prerender la fige au build).
   - `src/lib/supabase/client.ts` : lit la config depuis le provider au lieu de `process.env`.
   - `src/lib/supabase/server.ts`, `src/lib/supabase/middleware.ts`, `src/lib/supabase/admin.ts`, `src/lib/site-url.ts`, `src/app/api/workspaces/[id]/members/route.ts` : passent par `runtime-config.ts`.
   - `scripts/setup.mjs` + `.env.example` : écrire les nouveaux noms (dev local inchangé côté usage).

3. **Mode un client par déploiement** (en dur, sans variable)
   - `src/app/login/page.tsx` : retirer l'onglet « Sign up » (connexion + mot de passe oublié seulement).
   - `src/app/dashboard/layout.tsx` : supprimer `createFirstWorkspace` ; un compte sans adhésion voit « Compte non rattaché — contactez votre administrateur ».
   - `src/components/DashboardShell.tsx` / `WorkspaceProvider.tsx` : masquer le sélecteur de workspace et « New workspace ».
   - `src/app/api/workspaces/route.ts` (`POST`) et `src/app/api/workspaces/[id]/route.ts` (`DELETE`) : 403 — le workspace appartient au back-office.

4. **Branding Yelema**
   - `src/config/branding.ts` : `appName: "Yelema"`, logo Yelema par défaut ; `BRAND_LOGO_URL` (runtime) le remplace s'il est fourni.
   - `src/app/globals.css` : couleurs de la charte Yelema (`--primary`, etc.) ; favicon.

5. **`/api/health`** — `src/app/api/health/route.ts` : `{ ok, version }`, 200 si les variables requises sont présentes, 503 sinon (sans dire lesquelles contiennent quoi). Route publique dans `src/lib/supabase/middleware.ts`.

6. **Rôles + isolation par utilisateur** (lot 3 du plan pendant — requis avant un vrai client)
   - `supabase/migrations/0002_roles_owner.sql` : `role in ('admin','member')` ; `agents.owner_user_id uuid` ; index unique `(workspace_id, owner_user_id)` (un agent par utilisateur) ; invitations `member` par défaut.
   - `src/lib/types.ts` : `Role = "admin" | "member"`.
   - `src/lib/auth.ts` (`requireAgentAccess`) : accès si propriétaire de l'agent **ou** admin du workspace ; sinon 404.
   - `src/app/api/agents/route.ts` : `GET` filtré sur `owner_user_id` pour un membre ; `POST` renseigne `owner_user_id` et refuse un second agent.
   - `src/app/api/workspaces/[id]/members/route.ts` : rôle choisi à l'invitation.
   - UI (`AgentsView`, `MembersView`, `CreateAgentButton`) : actions d'administration masquées pour un membre.
   - Décision à confirmer : **chaque utilisateur crée lui-même son agent** (« Créer mon agent »), l'admin voit tous les agents.

7. **Publication d'une version** — `scripts/build-image.sh <version>` :
   `docker buildx build --platform linux/amd64 --build-arg APP_VERSION=<v> -t agent37-app:<v> .`
   → `docker save agent37-app:<v> | gzip | ssh mstudio-vps 'gunzip | docker load'`
   → `docker image prune -f` distant en gardant N-1. Puis copier `supabase/migrations/` dans le back-office.

## 4. Hors périmètre

Traduction française de l'interface, SMTP, Clerk, multi-tenant partagé, custom domain Agent37,
paiement dans l'app, GitHub Actions (le script local suffit ; passage à GHCR plus tard sans impact
sur le back-office).

## 5. Vérifications

- `npm run typecheck` et `npm run build` propres.
- `docker build` → image < 250 Mo (`docker image ls`).
- Conteneur local avec un `.env` pointant sur le projet Supabase de test : `curl localhost:3000/api/health` = 200 ; `/` redirige vers `/login` ; pas d'onglet d'inscription ; `POST /api/workspaces` = 403.
- **Même image, deux `.env` différents** → deux apps qui pointent chacune sur leur propre Supabase (preuve que rien n'est figé au build).
- Isolation (après 6.) : deux membres, chacun ne voit et n'ouvre que son agent (404 sur l'URL de l'autre) ; l'admin voit les deux.

## 6. À lancer ou demander

| Où | Action |
|---|---|
| Poste du dev | Docker Desktop avec `buildx` ; accès SSH `mstudio-vps` en `BatchMode` |
| mstudio-vps | `uname -m` pour confirmer `x86_64` (sinon adapter `--platform`) |
| Supabase | Projet de test existant réutilisable pour les vérifications locales (pas de nouveau projet) |
| Charte Yelema | Logo (SVG), favicon, couleurs primaires — à fournir |
| Agent37 | Rien de nouveau pour ce plan (la clé de test actuelle suffit) |

## 7. Découpage

| Étape | Contenu | Durée |
|---|---|---|
| A | 1 + 2 + 5 : image et config au runtime, vérifiées avec deux `.env` | 2–3 j |
| B | 3 + 4 : mode client unique + branding | 1–2 j |
| C | 7 : script de publication, première version `v0.1.0` chargée sur le VPS | 0,5 j |
| D | 6 : rôles et isolation (avant le premier vrai client) | 2–3 j |
