# Plan : experts par profil, catalogue du back-office, déploiement Vercel

> Suite de `docs/plans/yelema-single-tenant.md`. Branche : `feat/experts-profils`, partie de
> `develop`. Pendant côté back-office : branche `feat/tenant-apps-vercel` de `yelema-platform`.
> Rédigé le 2026-10-05.
> **STATUS : décisions prises le 2026-10-05 ; plan à valider avant implémentation.**

## 1. Objectif

Partir de `develop` et y reprendre, de la branche `main` (travail du prestataire, à lire comme un
modèle et non à fusionner), ce qui fait le produit : parler à un expert, la présentation, les
connecteurs Composio de Yelema. Sans rien coder en dur sur les experts, sans image ni provisioning
dans ce dépôt, et avec un déploiement Vercel piloté par le back-office.

## 2. Décisions (2026-10-05)

| Sujet | Décision |
|---|---|
| Instances | **Une par membre**, comme aujourd'hui. Pas d'instance par workspace |
| Chat entreprise | Pas de chat commun. Le profil par défaut de l'instance peut servir de chat général personnel |
| Drive | `~/Livrables` de l'instance du membre. Rien n'est partagé entre collègues |
| Composio | Rattaché au **membre** (propriétaire de l'instance) : son Gmail, ses experts |
| Noms de profil | `client__expert` ; la clé catalogue est la partie après `__` |
| Experts (textes, photos, vidéos) | Servis par le back-office ; rien dans `src/config` ni `public/` |
| Comptes, rôles, adhésions, instances, profils | Back-office seul ; l'app ne crée ni membre ni agent |
| Déploiement | Vercel, **un projet par client**, version choisie par client, piloté par l'API depuis le back-office |
| Image d'agent | Dépôt `Yelema-ai/yelema-hermes`, versions dans son `versions.json` |
| Vue admin | L'admin voit son propre espace ; celui d'un membre s'ouvre depuis Administration *(hypothèse, à confirmer)* |
| Clé et proxy Composio | Dans l'app ; le back-office fournit la clé et le jeton de l'instance *(hypothèse, à confirmer)* |

## 3. Contrat avec le back-office (à ne pas casser)

| Élément | Forme |
|---|---|
| Version | Tag git `vX.Y.Z` de ce dépôt ; le back-office déploie ce tag sur le projet Vercel du client |
| Variables (lues au runtime) | `AGENT37_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SITE_URL`, `BRAND_LOGO_URL`, `WORKSPACE_ID`, `APP_VERSION`, **`COMPOSIO_API_KEY`**, **`BACKOFFICE_URL`** |
| Santé | `GET /api/health` → `200 { ok: true, version }` |
| Schéma | `supabase/migrations/*.sql` au tag ; **additif uniquement** (base partagée) |
| `agents` (écrit par le back-office) | `owner_user_id` (le membre), `profiles text[]` (profils installés, `client__expert`), `ready boolean`, `apps_token_hash text` (SHA-256 du jeton de l'instance) |
| Catalogue | `GET {BACKOFFICE_URL}/api/v1/public/experts` et `/experts/{key}` : nom, rôle, accroche, description, compétences, livrables, médias en URL, plus pronom, titre court, suggestions, dossier du drive, catégories ordonnées, expert par défaut |
| Jeton de l'instance | Le back-office écrit `~/.yelema/apps-mcp.json` = `{ url: <SITE_URL>/api/composio-mcp, token }` ; l'app ne voit que son hash |
| Accès | Lien `/auth/callback?token_hash=…&type=invite&next=/reset-password` (inchangé) |

État de la base partagée au 2026-10-05 : les colonnes `agents.profiles`, `agents.ready`,
`agents.apps_token_hash` et `workspaces.logo_url` y ont été ajoutées par le prestataire
(migrations 0003 à 0005 de `main`). À confirmer avant d'écrire la migration du lot 5.

## 4. Mise en route

| # | Étape | État |
|---|---|---|
| 1 | Créer la branche `feat/experts-profils` depuis `develop` | Fait en local le 2026-10-05, non poussée |
| 2 | Committer ce plan sur la branche | À faire, sur accord |
| 3 | Committer et pousser le contenu initial de `Yelema-ai/yelema-hermes` (copie locale `~/yelema-hermes` : image, README, `versions.json`, script de build) puis poser le tag `v1.0.0` | À faire, sur accord |
| 4 | Passer l'origine de ce dépôt en SSH (`git@github-yelema:Yelema-ai/yelema-website.git`) : l'origine HTTPS actuelle utilise un compte sans droit d'écriture | À faire avant le premier push |
| 5 | Pousser `feat/experts-profils` ; toute fusion passe par une PR vers `develop` | Après le lot 1 |
| 6 | Supprimer `infra/` de ce dépôt | Sans objet sur cette branche : `infra/` n'existe que sur `main`, qu'on ne fusionne pas |

`main` ne reçoit rien de cette branche et n'y est jamais fusionnée. On y lit les fichiers un par un
(`git show origin/main:<chemin>`) et on les réécrit ici, adaptés (§ 7).

## 5. Lots

| Lot | Contenu | Dépend du back-office |
|---|---|---|
| 1 | **Garde-fou de chemin** sur toutes les routes Fichiers (`lib/drive.ts`, `lib/drive-paths.ts` de `main`) : aujourd'hui un membre peut lire `~/.hermes` | Non |
| 2 | **Parler à un profil** : `profile` dans `lib/agent37.ts` (sessions), les routes chat, `ChatProvider`, `useChat` ; URL `/experts/{agentId}/{profileId}/{onglet}` ; validation contre les profils réels de l'instance ; correction des deux défauts du menu (clé React en double, surlignage commun). C'est l'API standard d'Agent37 (`profile` dans `POST /v1/responses`, `?profile=` sur les sessions), pas une fonction de l'image : le profil est renvoyé **à chaque tour**, un profil absent répond `404 profile_not_found` (message clair à l'utilisateur), et le premier message d'un profil au repos est plus lent (un processus par profil, arrêté après 10 minutes) | Non, mais l'instance doit avoir une passerelle Agent37 ≥ v0.17.0 |
| 3 | **Catalogue** : client du catalogue, cache dans le BFF, jointure avec les profils installés ; lecture de `agents.profiles`, repli sur l'exec actuel | Champs ajoutés au catalogue |
| 4 | **Présentation** reprise de `main` : accueil, galerie Recruter (installé ou non), fiche, espace expert (Discussion, Livrables, Fiche), menu mobile, liens de téléchargement dans le chat ; classes de style adaptées au thème de `develop`, mode sombre conservé | Lot 3 |
| 5 | **Composio** : page Connecteurs et proxy `/api/composio-mcp`, identité = propriétaire de l'instance, contrôle `WORKSPACE_ID` après la recherche du jeton, `COMPOSIO_API_KEY` dans `runtime-config` et `/api/health` | Jeton écrit sur l'instance, image `yelema-hermes` |
| 6 | **Vercel** : `vercel.json` (`git.deploymentEnabled: false`), version dans `/api/health`, premier tag ; retrait de `Dockerfile` et `scripts/build-image.sh` une fois validé | Pilote Vercel |
| 7 | **Routines et sujets Telegram** (seconde étape) | Image `yelema-hermes` ≥ révision 4 |

## 6. Ce qu'on reprend de `main`, fichier par fichier

« Tel quel » : copie avec seulement les adaptations du § 7. « Adapté » : même idée, réécrite pour
une instance par membre. Les chemins sont ceux de `main`.

| Lot | Fichiers de `main` | Reprise |
|---|---|---|
| 1 | `src/lib/drive.ts`, `src/lib/drive-paths.ts` ; l'appel `assertInDrive` dans `src/app/api/agents/[id]/files/{route,list,content,dir,archive}/route.ts` et `chat/files/route.ts` | Tel quel pour les deux libs ; les routes de `develop` gardent leur code et reçoivent le garde-fou |
| 2 | `src/lib/profiles.ts` ; le paramètre `profileQuery` de `src/lib/agent37.ts` (`listSessions`, `getSession`, `deleteSession`, `renameSession`) ; `src/app/api/agents/[id]/chat/{responses,sessions,sessions/[sessionId]}/route.ts` ; `src/components/chat/ChatProvider.tsx` et `useChat.ts` (passage du profil) | Adapté : la liste blanche statique `EXPERT_KEYS` devient les profils réels de l'instance ; les menus modèle et effort de `develop` sont conservés |
| 3 | Aucun fichier : `src/config/experts.ts` sert seulement à lister les champs que le catalogue doit fournir | Nouveau code (`src/lib/catalogue.ts`, route BFF) |
| 4 | `src/components/home/HomeView.tsx`, `src/components/experts/{ExpertGallery,ExpertFiche,ExpertWorkspace}.tsx`, `src/components/app/ExpertAvatar.tsx`, `src/components/chat/{Markdown,ChatScreen,ChatView}.tsx`, les pages `src/app/(app)/{accueil,recruter,fichiers}/page.tsx` et `experts/[key]/[[...tab]]/page.tsx` ; dans `src/components/app/AppShell.tsx` : le menu mobile, le fil d'Ariane, les entrées de navigation ; `src/app/layout.tsx` : la protection contre la traduction de Chrome | Adapté : données du catalogue, instance de l'URL, classes du thème de `develop`. La coque de `develop` est conservée ; on n'y ajoute que ces éléments |
| 5 | `src/lib/composio.ts`, `src/lib/integration-catalog.ts`, `src/app/api/composio-mcp/route.ts`, `src/app/api/agents/[id]/integrations/**`, `src/components/integrations/ConnectorsView.tsx`, l'exclusion du chemin dans `src/proxy.ts`, la colonne `apps_token_hash` de `supabase/migrations/0005_apps_mcp.sql` | Adapté : identité Composio = propriétaire de l'instance ; contrôle `WORKSPACE_ID` dans le proxy ; remplace `IntegrationsTab.tsx` de `develop` (Composio géré par Agent37) |
| 6 | Rien | Nouveau `vercel.json` |
| 7 | `src/lib/hermes-cron.ts`, `src/lib/routines.ts`, `src/app/api/agents/[id]/routines/**`, `src/components/experts/ExpertRoutines.tsx`, `instancePortFetch` dans `src/lib/agent37.ts` ; `src/lib/telegram-topics.ts`, `src/app/api/agents/[id]/channels/telegram/topics/route.ts`, `src/components/channels/TelegramTopics.tsx` ; `setAutoSleep` et `keepAwake` | Adapté : profil et compétences lus dans le catalogue, droit « owner » |

Canaux (Telegram, WhatsApp) : la version de `develop` est plus complète (formulaire générique,
appairage Telegram par QR) et reste en place ; on ne reprend de `main` que les libellés français.

## 7. À adapter dans tout code repris de `main`

- `requireAgentAccess(id, "member" | "admin")` devient `"owner" | "admin"` : sur `main`, envoyer un
  message exige « admin », ce qui bloquerait un membre sur son propre agent.
- `process.env.NEXT_PUBLIC_*` devient `src/lib/runtime-config.ts` ; `createClient()` côté
  navigateur devient `useSupabase()`.
- `useAgentId()` (l'instance unique du workspace) devient l'instance de l'URL.
- `getExpert`, `EXPERTS`, `EXPERT_KEYS` deviennent des lectures du catalogue.
- `composioUserId("workspace:<id>")` devient l'identité du propriétaire de l'instance.
- Classes de style absentes du thème de `develop` : `bg-surface`, `border-line`, `bg-bg`, `on-brand`.

## 8. À ne pas reprendre

`src/config/experts.ts`, `public/experts/`, `infra/`, `scripts/provision-workspace.mjs`, la création
et le retrait de membres, les liens `/acces` et `/bienvenue`, le sélecteur d'espace, la migration
0004 (rôle `admin` par défaut) et l'index unique de 0003.

## 9. Vérifications

- `npm run typecheck` et `npm run build` propres à chaque lot.
- Isolation : un membre ne voit ni l'agent, ni le drive, ni les comptes connectés d'un autre (404).
- Un membre envoie un message à deux profils de son instance : deux historiques distincts.
- Un profil inexistant ou d'une autre instance est refusé avant tout appel à l'instance.
- Sur une instance trop ancienne pour le champ `profile`, l'app affiche une erreur lisible au lieu d'ouvrir le chat par défaut.
- Un chemin hors `~/Livrables` est refusé sur chaque route Fichiers.
- Le proxy Composio refuse un jeton d'un autre workspace.
- Aucun nom d'expert ni média dans le dépôt (`grep` sur les clés des experts).

## 10. Points ouverts

| Point | À trancher par |
|---|---|
| Ce que l'admin peut faire dans l'espace d'un membre (lire ses conversations, utiliser son Gmail, ou seulement voir l'état) | Produit |
| Mise en veille : la couper seulement pour les membres qui ont un canal ou une routine active | Produit et coût |
| Instances encore en ancien nommage (`djeneba` sans préfixe) : gérer les deux formes ou migrer | Back-office |
| Nombre de projets et durée maximale des requêtes permis par l'offre Vercel | Ops |
