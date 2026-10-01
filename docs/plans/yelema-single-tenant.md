# Plan : kit Yelema « un client par déploiement »

> Pendant de `yelema-platform/docs/plans/agent37-espaces-dedies.md` (mise en service depuis le
> back-office). Branche prévue : `feat/yelema-single-tenant`. Rédigé le 2026-09-30.
> **STATUS : validé le 2026-09-30 — étapes A, B, C, D réalisées ; v0.1.0 publiée (voir § 8).**

## 1. Objectif

Transformer ce fork en **une image Docker générique** que le back-office Yelema démarre une fois par
client, avec la configuration de ce client injectée **au démarrage** (jamais au build). Un
déploiement = une organisation : pas d'inscription libre, pas de choix de workspace, un branding
Yelema commun.

## 2. Contrat avec le back-office (à ne pas casser)

| Élément | Forme |
|---|---|
| Image | `agent37-app:vX.Y.Z` (linux/amd64), port `3000`, utilisateur non-root |
| Variables lues au runtime | `AGENT37_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SITE_URL`, `BRAND_LOGO_URL` (optionnelle), **`WORKSPACE_ID` (v0.1.4 ; obligatoire en base partagée)** |
| Santé | `GET /api/health` → `200 { ok: true, version }` sans secret |
| Schéma | `supabase/migrations/*.sql` de la version, copiés par le back-office dans `assets/agent37-app/<version>/` |
| Données initiales | le back-office crée l'admin (Auth) et **la** ligne `workspaces` du client ; l'app ne crée plus de workspace |
| Base (v0.1.4) | **un seul projet Supabase pour tous les clients** (option : projet dédié). Le déploiement ne voit que le workspace `WORKSPACE_ID` (404 sinon). Migrations **additives uniquement**, appliquées une fois au projet partagé. Voir `docs/decisions/supabase-projet-partage.md` |
| Domaine des agents (v0.1.4) | aucune variable : si le workspace Agent37 a un domaine personnalisé, l'app sert les URL `domain_urls` renvoyées par l'API (liens signés, ports) au lieu d'`agent37.app` |
| Membres et agents (v0.1.2) | le back-office crée chaque membre (Auth + `memberships`, rôle `admin`/`member`), **son** instance Agent37 (`metadata.app_workspace` = id du workspace) et sa ligne `agents` (`owner_user_id`) ; l'app ne crée ni ne supprime plus d'agent ni de membre (403), et ne liste que les instances de son workspace |
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
   - Décision retenue : **chaque utilisateur crée lui-même son agent** (« Create my agent », un seul), l'admin voit tous les agents.
   - Accès : propriétaire ou admin pour utiliser / configurer / démarrer l'agent ; suppression, redimensionnement et budget réservés à l'admin.
   - Une invitation acceptée ne rétrograde jamais un admin. Les agents antérieurs à 0002 (`owner_user_id` nul) ne sont visibles que par l'admin.

7. **Publication d'une version** — `scripts/build-image.sh <version>` :
   `docker buildx build --platform linux/amd64 --build-arg APP_VERSION=<v> -t agent37-app:<v> .`
   → `docker save agent37-app:<v> | gzip | ssh mstudio-vps 'gunzip | docker load'`
   → sur l'hôte, suppression des anciens tags `agent37-app` en gardant la version courante et la
   précédente (pas de `docker image prune` global : l'hôte est partagé). Puis copie de
   `supabase/migrations/*.sql` dans `~/yelema-platform/assets/agent37-app/<version>/`.

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

## 8. Versions publiées

| Tag | Date | Commit | Image sur `mstudio-vps` | Migrations (`assets/agent37-app/<tag>/`) | Contenu |
|---|---|---|---|---|---|
| `v0.1.0` | 2026-09-30 | `910fb65` | `agent37-app:v0.1.0` — linux/amd64, `USER node`, 206 Mo, `APP_VERSION=v0.1.0` | `0001_init.sql`, `0002_roles_owner.sql` | Étapes A–D : config au runtime, `/api/health`, un client par déploiement, branding **provisoire**, rôles `admin`/`member` + un agent par utilisateur |
| `v0.1.1` | 2026-09-30 | `910fb65` + correctif **non commité** | `agent37-app:v0.1.1` — linux/amd64 | `0001_init.sql`, `0002_roles_owner.sql` (inchangées) | Redirections (`/auth/callback`, middleware → `/login`) construites depuis `SITE_URL` : derrière Apache, `request.url` donnait `0.0.0.0:3000`. `build-image.sh` copie les migrations dans `apps/control-plane/src/modules/tenant-apps/assets/` (et non plus `assets/` à la racine) |
| `v0.1.2` | 2026-10-01 | `910fb65` + correctifs **non commités** | `agent37-app:v0.1.2` — linux/amd64 | `0001_init.sql`, `0002_roles_owner.sql` (inchangées) | Création/suppression d'agent, invitations et retrait de membre désactivés (403 « managed by the Yelema back-office », boutons retirés) ; liste des agents filtrée sur `metadata.app_workspace` (compte Agent37 partagé entre clients) |
| `v0.1.3` | 2026-10-01 | `910fb65` + correctifs **non commités** | `agent37-app:v0.1.3` — linux/amd64 | `0001_init.sql`, `0002_roles_owner.sql` (inchangées) | Telegram par QR code (bot géré créé via l'onboarding Hermes, service Nous) par défaut ; collage du jeton BotFather conservé en repli |

Notes pour le back-office :
- Appliquer les migrations **dans l'ordre** (`0001` puis `0002`) ; les deux sont idempotentes.
- Le contrat § 2 est inchangé. La ligne `memberships` de l'admin est créée par le trigger
  `on_workspace_created` à l'insertion de `workspaces` (rôle `admin`).
- Les invitations créées dans l'app sont `member` par défaut ; l'admin peut choisir `admin`.

## 9. Lot 2 — à implémenter (validé le 2026-10-01)

Ordre d'exécution ; **Kit** = ce dépôt, **BO** = `yelema-platform` (autre session).

| # | Où | Élément | Détail | Statut |
|---|---|---|---|---|
| 0 | Kit + BO | Commiter l'existant | v0.1.1 → v0.1.3 publiées depuis des changements **non commités** (kit) ; module `tenant-apps` non commité (BO) | à faire |
| 1 | BO | **Outils payants Perflo désactivés** | `env: { AGENT37_MANAGED_PLUGIN_PERFLO_ENABLED: "false" }` à la création de chaque instance (`MEMBER_INSTANCE`) ; un appel peut coûter jusqu'à $3,50 | à faire |
| 2 | Kit | **v0.1.4 — base partagée** | `WORKSPACE_ID` lu au runtime ; `getRole` renvoie null hors de ce workspace ; dashboard, `/api/workspaces`, invitations filtrés | **codé (`f1863d7`), testé le 2026-10-01 sur le projet partagé `yelema` (`mmxhmstzbdwatrphwcqu`), non publié** |
| 3 | BO | **Mode base partagée** | projet partagé = **`yelema` (`mmxhmstzbdwatrphwcqu`)**, déjà migré (0001, 0002) — ne plus créer de projet par client ; le workspace « Yelema » existant reçoit son `WORKSPACE_ID` au prochain redéploiement ; projet Supabase créé / migré / auth configurée **une fois** (wildcard `https://*.app.yelema.ai/**`) ; par client : ligne `workspaces` + admin ; `WORKSPACE_ID` dans le `.env` et la liste blanche de `tenant-app-host` ; champ `database: shared \| dedicated` | à faire |
| 4 | BO | **P1-b Consommation** | `getUsage(from,to)` → `GET /v1/usage` ; collection `agent37-usage-daily` (jour × instance, upsert) ; job quotidien qui relit les 3 derniers jours ; rattachement via `agent37InstanceId` (sinon « non attribué ») ; vue par client et membre vs plafond ; coûts → `VendorCosts`, refacturation → `CreditLedger` selon une règle par plan (**décision commerciale à prendre**) | à faire |
| 5 | BO | **Alerte `past_due`** | dans le même job : une instance `past_due` = portefeuille négatif = **tous les clients en veille** ; alerte immédiate (pas d'API de solde chez Agent37) | à faire |
| 6 | Ops + Kit | **P1-a Domaine des agents** | prérequis : $100 de recharges cumulées, domaine **dédié** (pas un sous-domaine de `yelema.ai`) dont toute la DNS part chez Agent37 ; `POST /v1/domains` → nameservers → `/verify` (script ops, une fois). Kit : `domain_urls` déjà pris en compte en v0.1.4 | kit prêt ; ops à faire |
| 7 | BO | **P2 Lien Agent37** | sur chaque membre : lien vers l'instance dans le dashboard Agent37 (onglet Metrics, logs, usage). Logs, métriques et restauration restent **côté Agent37** | à faire |
| 8 | BO | **P2 Export avant suppression** | `GET /v1/files/archive` stocké avant de supprimer une instance (suppression définitive après 7 j). Sauvegardes : **automatiques** chez Agent37 (7 nuits glissantes, gratuites) ; restauration = procédure ops par API, sans interface | à faire |
| 9 | BO | **P3 BYO modèle via LiteLLM** | passerelle LiteLLM ; une clé virtuelle par instance (plafond, révocation, coût réel) injectée en `env` à la création (non modifiable ensuite) ; le coût LLM vient alors de LiteLLM, P1-b ne garde que compute / Composio / Brave | à faire |
| 10 | BO | P3 BYO Composio | kit `hermes-openclaw-composio`, après le MVP | plus tard |
| — | — | Écartés du back-office | instances `performance`, crons imposés, clés SSH (une clé ouvre toutes les instances) | — |
| — | Vishnu | À voir avec lui | Honcho / mémoire partagée (en dernier) ; image Hermes Yelema + prompt système de sélection des skills (plus tard) ; relèvement du plafond de 200 instances (confirmé) | — |

Décisions prises le 2026-10-01 : un expert = **un profil sur l'instance** du membre ; un seul
workspace et une seule clé Agent37 pour tous les clients (plafond de 200 instances à faire relever).
