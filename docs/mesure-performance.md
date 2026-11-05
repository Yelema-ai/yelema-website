# Mesure chez l'utilisateur et budget JS (lot 1 « performance instantanée »)

## Mesure par écran (RUM)
`src/components/RumReporter.tsx`, monté une fois dans `src/app/layout.tsx`. Un onglet tiré au sort mesure, pour
chaque écran de l'app connectée :

| Mesure | Sens |
|---|---|
| `render` | du clic (ou du début du chargement) au contenu de `<main>` affiché sans squelette (`aria-busy`, `animate-pulse`) ; `null` au-delà de 10 s |
| `inp` | le plus long délai clic → image de l'écran (Event Timing ; absent sur Safari) |
| `api` | appels `/api/*` partis dans les 10 premières secondes de l'écran |

Les enregistrements partent par `navigator.sendBeacon` vers `POST /api/rum` quand l'onglet est masqué (ou par 20).
Aucun utilisateur, aucune adresse IP, aucun paramètre d'URL ; les identifiants du chemin deviennent `:id`
(`src/lib/rum.ts`). Login, invitations et tableaux de bord publics ne sont pas mesurés.

## Variables (Vercel, serveur seulement)
| Variable | Défaut | Rôle |
|---|---|---|
| `RUM_SAMPLE_RATE` | `0.1` | part des onglets mesurés (0 coupe la mesure) |
| `RUM_OTLP_ENDPOINT` | — | base OTLP/HTTP du collecteur (`…/v1/metrics` ajouté) ; absente : une ligne `[rum] [...]` par lot dans les journaux Vercel |
| `RUM_OTLP_HEADERS` | — | en-têtes `k=v,k2=v2` (ex. `Authorization=Basic%20…`) si la porte du collecteur est protégée |

Métriques envoyées (histogrammes delta) : `yelema.rum.render{screen,nav}`, `yelema.rum.interaction{screen}`,
`yelema.rum.api_calls{screen}`, et le compteur `yelema.rum.render_timeouts{screen,nav}`. Côté plateforme, le
collecteur les cumule (`deltatocumulative`) et les expose à Prometheus ; requêtes : `docs/ops/mesure-performance.md`
du dépôt `yelema-platform`.

## Budget JS par route
`npm run build && npm run budget:js` : JS chargé à l'ouverture de chaque route (gzip, chunks racine + entrées de la
route), comparé à `perf-budget.json` ; sortie 1 si une route dépasse. `npm run budget:js -- --write` réécrit le budget
à la mesure actuelle + 10 % : à faire seulement quand une hausse est voulue.
