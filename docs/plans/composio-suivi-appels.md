# Plan : suivi des appels Composio, un par un, avec leur prix

> Rédigé le 2026-10-10. Demande de Vishnu : enregistrer chaque appel Composio, avec un prix par
> appel, et montrer la dépense par appel et par utilisateur.
> Pendant côté back-office : `yelema-platform/docs/plans/composio-suivi-appels.md` — **à réécrire**
> d'après le § 5 : il décrivait une table écrite par l'app.
> **Partage des rôles (décidé par Selim le 2026-10-10)** : l'app n'écrit ni ne lit cette donnée dans
> Supabase. Le proxy **déclare** chaque exécution au back-office ; le back-office l'enregistre, lui
> applique le tarif (réglable chez lui) et sert la consommation aux écrans (`/api/v1/app/*`).
> Règle générale : l'app évite autant que possible d'utiliser Supabase directement.
> **Contrat du § 5.3 accepté par le back-office le 2026-10-10**, avec sept précisions (reprises ici).
> **STATUS : lots A et B codés le 2026-10-10 (accord de Selim), non commités, recette à faire.**

## 1. Objectif

Les experts atteignent Gmail, Notion, Slack, etc. par `src/app/api/composio-mcp/route.ts`, avec la
clé Composio de Yelema. Ce proxy transmet sans rien compter : Yelema paie Composio sans savoir quel
client, quel membre ni quelle application a consommé.

Voulu :
1. chaque exécution d'outil enregistrée par le back-office : client, membre, instance, outil,
   application, date, prix ;
2. un prix par appel en francs CFA, fixé par Yelema dans le back-office et **figé sur la ligne** au
   moment de l'enregistrement ;
3. un écran pour les administrateurs du client, servi par le back-office (lot B).

## 2. Ce qui revient à qui

| | App (ce dépôt) | Back-office |
|---|---|---|
| Voir passer l'appel, en extraire les exécutions | ✅ | |
| Dire de quelle instance il vient | le jeton de l'instance, transmis tel quel, et le `workspace_id` de sa ligne `agents` | retrouve instance, client et membre par l'empreinte du jeton, qu'il garde désormais sur le membre |
| Table, index, vue, migration, droits | | ✅ |
| Tarif, prix de chaque ligne, cas à prix 0 | | ✅ |
| Application (`gmail`) déduite du nom d'outil | | ✅ |
| Servir la consommation aux écrans | | ✅ |

Conséquences pour ce dépôt : **aucune migration, aucune variable de tarif, aucune table en contrat**.
Le contrat entre les deux dépôts est une route HTTP (§ 5.3).

## 3. Décisions

Prises par Selim :
- Prix en francs CFA, jamais en dollars ; aucune conversion dans le code.
- Tarif réglable depuis le back-office (donc pas une variable d'environnement de l'app).
- L'écriture passe par le back-office, pas par Supabase depuis l'app.
- Une ligne par exécution. Ni arguments ni réponses : seulement le nom de l'outil.
- L'enregistrement ne doit jamais ralentir ni faire échouer un appel d'expert.

Prises par Selim le 2026-10-10, après la réponse du back-office :
- Le back-office reconnaît le proxy au **jeton de l'instance**. Pas de secret de service.
- Les outils de découverte (`COMPOSIO_SEARCH_TOOLS`, `COMPOSIO_GET_TOOL_SCHEMAS`) sont déclarés,
  marqués `via: meta` ; le back-office les met à prix 0.
- Une réponse de Composio hors 2xx est déclarée avec son statut ; le back-office décide du prix.
- Un script `npm test` sans dépendance (`node --test`) ; `AGENTS.md` mis à jour en conséquence.

Au back-office (dans son plan, plus ici) : la valeur du tarif ; le prix d'une exécution en échec et
de `COMPOSIO_MANAGE_CONNECTIONS` ; les clés étrangères ; la purge.

Plus rien à confirmer côté app pour le lot A.

## 4. Ce qui est vérifié, et ce qui ne l'est pas

Vérifié dans le code le 2026-10-10 :
- `src/app/api/composio-mcp/route.ts` transmet sans compter. Il retrouve l'instance par
  `agents.apps_token_hash` dans Supabase : cette lecture existe déjà et reste (voir § 7).
- Le kit d'origine (`agent37-platform/hermes-openclaw-composio`, MIT) a `extractBillableCalls`
  (`src/lib/composio.ts`, lignes 241-284), absente ici. Elle ignore les deux outils de découverte et
  rend `{ tool, calls }` : on l'adapte (on garde les outils de découverte, marqués `meta`).
- Composio, page de tarifs : « Each tool execution counts once. Meta tools such as tool search are
  free. » Un `COMPOSIO_MULTI_EXECUTE_TOOL` de N outils vaut N exécutions.
- `after()` : Next 16.2.9, utilisable dans un Route Handler, déjà employé dans
  `src/lib/session.ts:128`. Mais son rappel part quand la réponse est *finie*, donc à la fin du
  flux : une déclaration placée dedans serait perdue pour un appel coupé à 300 s (§ 5.2).
- Le client du back-office (`src/lib/backoffice.ts`, `call`) convient **sans adaptation** : son
  option `workspace` impose `X-Workspace-Id` (sans elle il prendrait le client épinglé de l'adresse,
  qui peut manquer), `token` donne le `Authorization: Bearer`, une réponse vide (`204`) passe, et
  l'erreur levée porte le statut (panne réseau = 503). Il ne journalise jamais le jeton. Son délai
  est de 15 s : sans effet sur l'expert, la déclaration n'étant pas attendue.
- Le proxy lit déjà `workspace_id` sur la ligne `agents` trouvée par le jeton : c'est cette valeur
  qui part dans `X-Workspace-Id`.
- `agents.owner_user_id` est l'identifiant Supabase Auth, écrit par le back-office lui-même ; avec
  le jeton d'instance comme preuve, l'app n'a pas à l'envoyer.
- Une déclaration pleine (200 exécutions, noms de 128 caractères) pèse environ 35 Ko : sous les
  64 Ko du back-office.
- Le dépôt n'a ni tests ni `lint` (`package.json` : `typecheck`, `build`, `smoke`). Node 24 lit le
  TypeScript sans outil, pour un fichier sans alias `@/` ni `server-only`.

Non vérifié :
- Si Composio facture une exécution en échec, ou `COMPOSIO_MANAGE_CONNECTIONS`.
- L'écart réel entre ce compteur et celui du tableau de bord Composio.
- Rien dans le code du back-office (dépôt non ouvert). Ce qu'il a dit : il n'avait **pas**
  l'empreinte du jeton d'instance (il l'écrivait seulement dans `agents.apps_token_hash`) ; il
  ajoute un champ d'empreinte sur le membre et une reprise unique depuis Supabase.

## 5. Approche — lot A

1. **Extraction** (`src/lib/composio-usage.ts`, fonctions pures) : `method: "tools/call"`, message
   seul ou lot JSON-RPC. Multi-exécution = une exécution par outil, plafonnée à 50 ; vide = une
   exécution au nom du méta-outil, comme le kit. `via` : `direct` | `multi_execute` | `meta`.
   Des arguments on ne lit que `tool_slug`. Le corps vient de l'instance, et le back-office refuse
   toute la déclaration si un seul élément sort des bornes : un nom hors `[A-Za-z0-9_.-]{1,128}`
   est donc **écarté avant l'envoi**, et la liste est coupée à 200. Corps illisible ou liste vide ⇒
   **rien n'est envoyé**.
2. **Ne jamais ralentir ni casser un expert** : dès que Composio a répondu, le proxy fixe **une
   fois** `requestId` (UUID), `occurredAt` (l'heure de cette réponse), `httpStatus` et `calls`, puis
   lance la déclaration **sans l'attendre**, pendant que le flux part vers l'expert.
   `after(() => déclaration)` ne sert qu'à garder la fonction en vie jusqu'à sa fin, comme dans
   `src/lib/session.ts`. Une requête rejouée après un 401/404 de session Composio est déclarée une
   fois, avec le statut final ; rien si Composio n'a pas répondu (502 du proxy). Rien de ce qui
   arrive à la déclaration n'atteint l'expert.
3. **La route du back-office** (contrat accepté) :

   ```
   POST {BACKOFFICE_URL}/api/v1/app/composio-calls
   Authorization: Bearer <jeton de l'instance>
   X-Workspace-Id: <workspace_id de la ligne agents trouvée par ce jeton>

   { "requestId": "<uuid>", "occurredAt": "<ISO 8601>", "httpStatus": 200,
     "calls": [ { "tool": "GMAIL_SEND_EMAIL", "via": "direct" } ] }
   ```

   Bornes du back-office (un seul élément dehors ⇒ `400` pour toute la déclaration) : corps
   ≤ 64 Ko ; `requestId` UUID ; `httpStatus` entier de 100 à 599 ; `calls` de 1 à 200 éléments ;
   `tool` dans `[A-Za-z0-9_.-]{1,128}` ; `via` dans `direct`, `multi_execute`, `meta` ; `occurredAt`
   entre 24 h avant et 5 min après l'heure du serveur. Idempotence par instance et par `requestId`,
   en tout ou rien. Débit : 300 déclarations par minute et par instance.

   | Réponse | Sens | Ce que fait le proxy |
   |---|---|---|
   | `204` | enregistré, ou déjà vu | rien |
   | panne réseau, `5xx` | | **une** nouvelle tentative, même `requestId`, mêmes `calls` ; puis abandon journalisé |
   | `400` | corps refusé | jamais retenté ; journalisé comme **anomalie de notre côté** (l'extraction a sorti une déclaration hors bornes) |
   | `401` | jeton inconnu ou autre client | jamais retenté ; une ligne au journal. Attendu pendant le rebranchement d'une instance, et tant que la reprise des empreintes n'est pas jouée |
   | `404` | route absente ou module coupé | jamais retenté ; une ligne au journal. Permet de publier l'app avant le back-office |
   | `429` | débit dépassé | jamais retenté ; une ligne au journal |

   Le jeton n'est jamais journalisé. Le back-office écrit une ligne par élément de `calls`, au prix
   du moment.
4. **Aucune nouvelle dépendance**, aucune nouvelle variable d'environnement, aucun changement à
   `call()`.

## 5 bis. Lot B — routes de lecture du back-office (codées chez lui ; écran pas dans cette session)

Forme réelle, donnée par le back-office le 2026-10-10. Les deux routes sont réservées aux
administrateurs (`403` sinon) ; le client est pris dans la session.

`GET /api/v1/app/composio-usage?from=&to=&member=`

```json
{
  "from": "2026-10-01", "to": "2026-10-10",
  "executions": 1240, "amountMilliXof": 6200000,
  "byDay": [ { "day": "2026-10-01", "executions": 0, "amountMilliXof": 0 } ],
  "byToolkit": [ { "toolkit": "gmail", "executions": 600, "amountMilliXof": 3000000 } ],
  "byMember": [ { "email": "awa@client.com", "name": "Awa Diop", "executions": 800, "amountMilliXof": 4000000 } ]
}
```

`GET /api/v1/app/composio-usage/calls?from=&to=&member=&page=`

```json
{
  "page": 1, "hasMore": true,
  "items": [
    { "occurredAt": "2026-10-10T09:12:44.000Z", "email": "awa@client.com", "name": "Awa Diop",
      "toolkit": "gmail", "tool": "GMAIL_SEND_EMAIL", "via": "direct",
      "httpStatus": 200, "priceMilliXof": 5000 }
  ]
}
```

Règles :
- `from` et `to` : dates `AAAA-MM-JJ`, bornes incluses, jours UTC. Sans elles : du 1er du mois à
  aujourd'hui. 92 jours au plus, sinon `400`.
- `member` : l'e-mail d'un membre du client ; un e-mail inconnu rend `404`.
- `byDay` : un point par jour de la période, à zéro quand rien n'a été déclaré.
- `toolkit` vaut `null` quand l'application est inconnue (affiché « Autre »).
- `email` et `name` valent `null` pour un appel sans membre ; `name` peut aussi être `null` pour un
  membre connu sans nom renseigné (afficher alors l'e-mail).
- Lignes `meta` : dans la liste, à prix 0, mais pas dans `executions`. L'écran choisit de les
  montrer ou non.
- Une réponse hors 2xx est gardée à prix 0 et **compte** dans `executions`.
- Liste : pages de 100, de la plus récente à la plus ancienne ; `hasMore`, pas de total.
- Montants en millièmes de F CFA : diviser par 1000 et arrondir au franc à l'affichage seulement.
  Tarif au 2026-10-10 : 5 F CFA par exécution (`5000`).

Écran codé le 2026-10-10, avec ces choix :
- un onglet **Consommation** à part dans l'Administration (`/administration/consommation`), réservé
  aux administrateurs comme Facturation, et non un onglet dans Connecteurs, qui est à chacun ;
- période = un mois UTC au choix, le mois en cours par défaut ; filtre par membre parmi ceux qui ont
  consommé ce mois-là ;
- les lignes `meta` sont montrées, étiquetées « Recherche d'outils » ; une réponse hors 2xx est
  étiquetée « Non abouti » ;
- `byDay` n'est pas affiché ;
- back-office sans la route (`404`) : l'onglet reste, et l'écran dit sa phrase d'erreur.

## 6. Fichiers

```
Lot A — déclaration
src/lib/composio-usage.ts            ← extraction : fonctions pures, aucun import
src/lib/composio-usage.test.ts       ← `node --test`
src/lib/backoffice.ts                ← `reportComposioCalls(jeton d'instance, workspace_id de la ligne, déclaration)`, par `call()` tel quel
src/app/api/composio-mcp/route.ts    ← lance la déclaration sans l'attendre
package.json                         ← script `test` (aucune dépendance)
AGENTS.md                            ← contrat du proxy, `npm test`

Lot B — écran
src/lib/backoffice.ts                               ← `composioUsage` et `composioUsageCalls` (routes du § 5 bis)
src/app/api/composio-usage/route.ts, calls/route.ts ← BFF, réservé aux administrateurs comme la facturation
src/app/api/composio-usage/_filter.ts               ← période et membre vérifiés avant l'URL du back-office
src/components/integrations/UsageView.tsx           ← l'écran
src/app/(app)/administration/consommation/page.tsx, ../layout.tsx ← onglet « Consommation »
AGENTS.md
```

## 7. Risques et hors périmètre

- **Lignes perdues, sans file d'attente**, dans quatre cas : back-office injoignable (panne,
  déploiement) après une nouvelle tentative ; plus de 300 déclarations par minute pour une
  instance ; instance en cours de rebranchement ; instance déjà branchée tant que le back-office
  n'a pas joué sa reprise des empreintes (alors **toutes** ses déclarations sont refusées). Les
  experts continuent dans tous les cas. Assumé ; l'écart se mesure en recette.
- Le jeton d'instance part vers le back-office, qui l'a lui-même émis mais n'en gardait pas
  l'empreinte : il la garde désormais. Le jeton n'est jamais journalisé.
- Journal : un `401` ou un `404` durable donne une ligne par appel d'outil. Accepté pour le lot A.
- Écart avec la facture Composio (échecs, lots) ⇒ mesuré en recette ; règle isolée dans une
  fonction testée.
- **Reste un accès direct à Supabase** : la recherche du jeton par le proxy. La confier au
  back-office le mettrait sur le chemin de chaque appel d'outil (latence, panne bloquante) :
  hors de ce lot, à décider à part.
- **Hors périmètre** : écran (lot B) ; ligne de facture ; plafonds ; alertes ; instances restées
  sur le Composio géré par Agent37 (elles ne passent pas par ce proxy) ; modèles (LiteLLM).

## 8. Tests et recette

- Unitaires (`npm test`) : appel simple, lot, multi-exécution, multi-exécution vide, découverte,
  nom d'outil refusé (écarté, le reste gardé), plafonds, liste vide, corps illisible.
- `typecheck`, `build`.
- Recette, **après la reprise des empreintes côté back-office** : un expert envoie un mail et lit un agenda ⇒ le back-office a les lignes, au bon membre ;
  back-office arrêté ⇒ l'expert travaille quand même ; total d'une journée comparé au tableau de
  bord Composio, écart noté ici.

## 9. Fini quand

- [x] Route du § 5.3 validée par le back-office (2026-10-10)
- [x] Accord de Selim sur ce plan
- [x] Tests ajoutés et verts ; `typecheck`, `build`
- [ ] Recette faite sur une instance réelle, écart avec Composio noté
- [x] `AGENTS.md` à jour
