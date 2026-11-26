# Visite guidée à la première connexion

> Branche : `feat/experts-profils-integration`.
> **STATUT : codée le 2026-11-25 ; `typecheck` et 994 tests passent. Pas encore essayée dans l'app.**

## 1. Fonctionnement

- Démarre sur l'accueil (`/`), une fois, à la première connexion.
- Pas de visite pour un membre qui n'a que le chat d'entreprise.
- Boutons : « Précédent », « Suivant », « Terminer », × « Passer la visite ». Clavier : flèches, Échap.
- Ouvre seulement des écrans et des onglets ; n'envoie, ne connecte et ne modifie rien.
- « Terminer », × et Échap la marquent vue. « Terminer » ramène à l'accueil.

## 2. Étapes

| Écran | Étapes (`data-tour`) | Action |
|---|---|---|
| Accueil | `home-composer` | Montre |
| Accueil (menu) | `nav-new`, `nav-search`, `nav-experts` | Montre |
| Un Expert | `expert-tab-chat` → `chat-attach` (trombone) | Clique l'onglet, montre le bouton |
| Un Expert | `expert-tab-files` → `files-import` (Importer) | Clique l'onglet, montre le bouton |
| Un Expert | `expert-tab-calls` → `expert-call` (Appeler) | Clique l'onglet, montre le bouton |
| Un Expert | `expert-tab-emails` → `expert-mail-create` (Attribuer une adresse e-mail) ou `expert-mail-new` (Nouveau message) | Clique l'onglet, montre le bouton |
| Un Expert | `expert-tab-routines` → `routine-new` (Nouvelle routine) | Clique l'onglet, montre le bouton |
| Intégrations | `int-tab-connecteurs` → `connector-search` (Chercher un outil) | Clique l'onglet, montre la recherche |
| Intégrations | `int-tab-canaux` → `channel-list` (messageries) | Clique l'onglet, montre la liste |
| Intégrations | `int-tab-emails` (admins) | Clique l'onglet |
| Intégrations | `int-tab-modeles` → `model-add` (Ajouter un compte) | Clique l'onglet, montre le bouton |
| Intégrations | `int-tab-mcp` → `mcp-add` (Ajouter un outil) | Clique l'onglet, montre le bouton |
| Intégrations | `int-tab-identifiants` → `vault-add` (Ajouter un accès) | Clique l'onglet, montre le bouton |
| Intégrations (menu) | `nav-integrations`, `nav-salons`, `nav-equipe`, `nav-conversations`, `nav-account` | Montre |

- Une étape absente ou masquée de l'écran est sautée.
- Une étape `follows` (le bouton de l'onglet cliqué juste avant ; plusieurs à la suite : celle affichée) est attendue 3 s au plus.
- Sans Expert, l'écran de l'Expert est passé.
- Après un changement d'écran, la visite attend sa première étape 8 s au plus.
- driver.js se charge pendant la vérification « vue » et l'affichage de l'accueil.
- Le menu est déplié pendant la visite ; sur téléphone, le tiroir s'ouvre pour les étapes du menu.

## 3. « Vue »

- Back-office qui renvoie `tour` dans `/app/me/preferences` : il est la vérité, l'app lui envoie `{ tour: { done: true } }`.
- Back-office qui ne renvoie pas `tour` : rien ne lui est écrit, le navigateur garde `yelema.tour-seen:<e-mail>`.
- Préférences illisibles (connexion par le back-office) : la visite ne démarre pas.
- Sans connexion par le back-office : navigateur seul.

## 4. Fichiers

| Fichier | Rôle |
|---|---|
| `src/components/tour/tour-steps.ts` | Étapes et textes |
| `src/components/tour/tour-navigation.ts` (+ test) | Étape et écran suivants |
| `src/components/tour/tour-runner.ts` | Déroulé (driver.js) |
| `src/components/tour/wait-for-element.ts` | Attente d'un élément |
| `src/components/tour/GuidedTour.tsx` | Démarrage, enregistrement « vue » |
| `src/components/tour/guided-tour.css` | Style de la bulle |
| `src/lib/tour-seen.ts` | Vue ou non |
| `src/lib/tour-state.ts` (+ test) | Logique du back-office (§ 6) |
| `src/app/api/account/preferences/route.ts` | Accepte `tour: { done }` |

Repères `data-tour` : `Sidebar.tsx`, `AccountMenu.tsx`, `HomeView.tsx`, `AgentWorkspace.tsx`,
`app/(app)/integrations/layout.tsx`, `chat/Attachments.tsx` (via `ChatComposer.tsx`), `files/FilesView.tsx`,
`voice/CallButton.tsx`, `experts/ExpertEmails.tsx`, `experts/ExpertRoutines.tsx`, `integrations/ConnectorsView.tsx`,
`channels/ChannelsTab.tsx`, `models/AccountsBoard.tsx`, `integrations/McpView.tsx`, `integrations/VaultView.tsx`.
Menu pendant la visite : `AppShell.tsx`.

Ajouter une étape : une ligne dans `tour-steps.ts` et `data-tour="<id>"` sur l'élément.

## 5. Bibliothèque et sécurité

- driver.js **1.10.2**, épinglé, chargé à la demande.
- Titres et textes posés en texte brut (`onPopoverRender`).
- La visite ne clique que sur des onglets.
- La route n'accepte que `tour: { done: true|false }`, sinon `400`.

## 6. Contrat back-office

`GET /api/v1/app/me/preferences` et le bloc `preferences` de `/app/bootstrap` :

```json
{ "tour": { "seenAt": "2026-11-24T10:00:00.000Z" } }
```

`seenAt` : `null` tant que la visite n'a pas été vue.

`PUT /api/v1/app/me/preferences` :

```json
{ "tour": { "done": true } }
```

- `done: true` : date du jour, ou la première si elle existe.
- `done: false` : `null`.
- Autre corps : `400`.
- Réponse : les préférences publiques, `tour` compris.

### À recopier dans `apps/control-plane`

Depuis `src/lib/tour-state.ts` (+ test) : `parseTourPrefs`, `parseTourUpdate`, `applyTourUpdate`, `NO_TOUR`.

1. `modules/tenant-apps/lib/memberPrefs.ts` : `tour: TourPrefs` dans `MemberPrefs`, `tour: NO_TOUR` dans
   `defaultPrefs()`, `out.tour = parseTourPrefs(r.tour)` dans `parseMemberPrefs`. Pas de migration.
2. `modules/app-api/preferences.ts` :
   - `publicOf` renvoie `tour` ;
   - `setPreferences` : `parseTourUpdate(body.tour)`, `400` si `null`, puis
     `next.tour = applyTourUpdate(next.tour, update, new Date())` ;
   - « Rien à modifier » nomme `tour` ;
   - `deps.setMemberPrefs` reçoit `tour`.
3. Tests de `tour-state.test.ts`.
4. `docs/specs/client-api-v1/openapi.yaml` (+ exemples), puis `pnpm api-reference:build`.

## 7. Tests

- `src/lib/tour-state.test.ts`
- `src/components/tour/tour-navigation.test.ts`

## 8. Reste à faire

1. Essai dans l'app : ordinateur et téléphone, clair et sombre, avec et sans Expert, Précédent entre écrans, Échap.
2. Relecture des textes (`tour-steps.ts`).
3. Copie du § 6 dans le back-office.
