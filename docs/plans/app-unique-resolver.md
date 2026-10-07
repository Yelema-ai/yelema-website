# Plan : une seule app pour tous les clients, résolue par sous-domaine

> Suite de `docs/plans/experts-profils-vercel.md`. Branche : `feat/experts-profils`. Pendant côté
> back-office : `docs/plans/app-unique-resolver.md` de `yelema-platform`. Rédigé le 2026-10-07.
> **STATUS : accord de Sélim le 2026-10-07 ; codé le même jour sur `feat/experts-profils`, non
> commité. Vérifié par `typecheck`, `build`, et un essai local contre un faux back-office (§ 8).
> Aucun essai sur le projet unique : il attend la route du resolver du back-office.**

## 1. Objectif

Aujourd'hui le back-office déploie un projet Vercel par client, avec ses variables. Cible : **un
seul déploiement** sert tous les clients. À chaque requête, l'app lit le sous-domaine
(`<client>.app.yelema.ai`) et demande au back-office à quel client il correspond : le **resolver**.

Le projet unique (`yelema-customer-app`), le joker `*.app.yelema.ai` et son certificat sont en
place depuis le 2026-10-07. Il ne manque que le code.

## 2. Décisions (2026-10-07)

| Sujet | Décision |
|---|---|
| Déploiement | Un seul projet Vercel pour tous les clients ; un second, « pilote », pour essayer une version |
| Identité du client | Le sous-domaine de la requête, résolu par le back-office |
| Connexion | Par le back-office uniquement ; l'ancien mode (Supabase Auth direct) n'existe pas dans l'app unique |
| Transition | La même version tourne dans les deux modes : `WORKSPACE_ID` posé = un client par déploiement, comme aujourd'hui ; absent = resolver |
| Clients à base Supabase dédiée | Plus tard, hors de ce plan |
| Développement local | Mode à un client, par les variables, inchangé |

## 3. Contrat avec le back-office

**Nouveau : le resolver.**

| Élément | Forme |
|---|---|
| Appel | `GET {BACKOFFICE_URL}/api/v1/app/tenant?host=<hôte>` |
| Authentification | `Authorization: Bearer <APP_RESOLVER_TOKEN>` (secret du serveur de l'app) |
| Réponse 200 | `{ workspaceId, name, logoUrl, status }`, `status` valant `active` ou `suspended` |
| Hôte inconnu | 404 |

**Inchangé.** Tous les autres appels `/api/v1/app/*` gardent l'en-tête `X-Workspace-Id` : l'app y
met le workspace résolu au lieu de celui de la variable. Le back-office continue de refuser une
session qui n'appartient pas à ce workspace.

**Variables du projet unique** : `AGENT37_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `COMPOSIO_API_KEY`, `BACKOFFICE_URL`, `APP_VERSION`, et la nouvelle
`APP_RESOLVER_TOKEN`. Disparaissent : `WORKSPACE_ID`, `SITE_URL`, `BRAND_LOGO_URL`,
`AUTH_VIA_BACKOFFICE`.

## 4. Fichiers à modifier

| Fichier | Changement |
|---|---|
| `src/lib/tenant.ts` (nouveau) | Le client de la requête : hôte lu dans les en-têtes, appel du resolver, réponse gardée 60 s par hôte, dernière réponse connue servie quelques minutes si le back-office ne répond pas. Avec `WORKSPACE_ID`, rend ce client-là sans appel |
| `src/lib/runtime-config.ts` | `multiTenant()` (vrai sans `WORKSPACE_ID`, avec `BACKOFFICE_URL` et `APP_RESOLVER_TOKEN`) ; `authViaBackoffice()` vrai dans ce mode ; `missingRequired()` et `publicConfig()` adaptés |
| `src/lib/backoffice.ts` | `X-Workspace-Id` pris du client résolu ; appel du resolver |
| `src/lib/auth.ts` | `getRole` : le workspace demandé doit être celui du sous-domaine |
| `src/lib/supabase/middleware.ts`, `src/proxy.ts` | Hôte inconnu : 404. Client suspendu : page dédiée. Redirection vers `/login` sur l'origine de la requête |
| `src/lib/session.ts` | Cookie de session lié à l'hôte : préfixe `__Host-` en production, jamais d'attribut `Domain` ; l'ancien nom reste lu le temps d'une version |
| `src/app/api/composio-mcp/route.ts` | L'instance retrouvée par son jeton doit appartenir au workspace du sous-domaine appelé |
| `src/app/(app)/layout.tsx`, `src/app/layout.tsx` | Workspace, nom et logo pris du client résolu |
| `src/app/auth/callback/route.ts` | Origine prise de la requête |
| `src/app/api/workspaces/route.ts`, `src/app/api/invitations/[token]/route.ts`, `src/app/invite/[token]/page.tsx` | Même remplacement de `deploymentWorkspaceId()` |
| `src/app/api/health/route.ts` | Dit le mode (`single` ou `multi`) ; ne dépend d'aucun client |
| `src/app/not-found` et page « espace suspendu » | Deux pages sans session |
| `AGENTS.md`, `docs/plans/experts-profils-vercel.md` | Architecture, contrat, veille à 30 minutes |

`deploymentWorkspaceId()` est lu à 7 endroits et `siteUrl()` à 3 : ils deviennent des lectures du
client résolu, asynchrones.

## 5. Approche

- **Un seul point de vérité** : `tenant()` répond « quel client pour cette requête ». Aucune route
  ne lit l'hôte elle-même.
- **L'hôte vient de la requête telle que Vercel la présente**, jamais d'un en-tête que le
  navigateur peut choisir.
- **Trois verrous d'isolation, indépendants** : le back-office refuse une session hors de son
  workspace (existant) ; `getRole` refuse un workspace qui n'est pas celui du sous-domaine ; le
  cookie de session ne part que vers l'hôte qui l'a posé.
- **Rien n'est mis en cache sans le client dans la clé.** Les caches actuels sont déjà par jeton
  (session), par utilisateur (Composio) ou communs à tous (catalogue) : à revérifier un par un.
- **Les routes sans session** (`/api/health`, `/api/composio-mcp`) ne passent pas par le cookie :
  la première ne dépend d'aucun client, la seconde compare le workspace de l'instance à celui de l'hôte.

Ordre : `tenant.ts` et `runtime-config` ; `backoffice.ts` et `auth.ts` ; proxy et pages ; cookie ;
proxy des connecteurs ; documentation. Puis tag `v0.5.0`.

## 6. Risques et hors périmètre

- **Isolation** : une erreur expose un client à un autre. D'où les trois verrous et l'essai croisé
  du § 7, avant tout vrai client.
- **Dépendance au back-office** : s'il ne répond pas, un hôte jamais vu ne peut pas être servi. La
  connexion en dépend déjà.
- **Changement de nom du cookie** : sans la lecture de l'ancien nom, tous les utilisateurs seraient
  déconnectés une fois.
- **Hors périmètre** : clients à base dédiée ; recherche du jeton des connecteurs par le
  back-office (elle reste dans Supabase) ; retrait de Supabase ; Clerk.

## 7. Vérification

- `npm run typecheck` et `npm run build`.
- En local, mode à un client : rien ne change.
- Sur le projet unique, avec deux clients de test A et B :
  - chaque sous-domaine affiche le nom et le logo de son client ;
  - un utilisateur de A ne peut pas se connecter sur l'adresse de B ;
  - un cookie de session de A, rejoué sur l'adresse de B, est refusé ;
  - le jeton d'une instance de A, présenté au proxy des connecteurs sur l'adresse de B, est refusé ;
  - un sous-domaine inconnu donne 404, un client suspendu la page dédiée.

## 8. Réalisé le 2026-10-07

Code conforme au § 4, avec deux écarts :

- Le resolver est en deux fichiers : `src/lib/tenant-resolver.ts` (appel et cache, utilisable par
  le proxy) et `src/lib/tenant.ts` (le client de la requête en cours).
- `siteUrl()` n'a pas changé : sans `SITE_URL`, l'origine de la requête sert déjà de repli.

Essai local (`next start`, sans `WORKSPACE_ID`, faux back-office avec les clients A, B et un
client suspendu) :

| Cas | Résultat |
|---|---|
| Page de connexion de A | 200, logo de A |
| Sous-domaine inconnu | 404, page « Espace introuvable » ; API : 404 JSON |
| Client suspendu | 403, page « Espace suspendu » ; API : 403 JSON |
| Connexion sur A | 200, cookie `__Host-yelema_session` (Secure, HttpOnly, sans Domain) |
| Mêmes identifiants sur B | 401 |
| Cookie de A rejoué sur B | 401 pour l'API, redirection vers la connexion pour les pages |
| Cookie sous son ancien nom, sur A | accepté |
| Proxy des connecteurs sur un hôte inconnu ou suspendu | 401 |

Constaté : le cache du resolver vit dans trois contextes du serveur (proxy, routes, pages), donc
jusqu'à trois appels par hôte et par minute au lieu d'un.

Non essayé : la lecture réelle du jeton d'une instance d'un autre client par le proxy des
connecteurs (la base était coupée pour l'essai), et tout ce qui demande le vrai back-office.
