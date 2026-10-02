# Décision : un seul projet Supabase pour tous les clients

> Décidée le 2026-10-01 (validée par Selim). Concerne le kit (`agent37-app` ≥ v0.1.4) et le
> back-office (`yelema-platform`, module `tenant-apps`). Remplace « un projet Supabase par client ».

## Contexte

Jusqu'à v0.1.3, le back-office crée **un projet Supabase par client** (étape `db_created`).
Or la base de l'app est minuscule : 4 tables (`workspaces`, `memberships`, `invitations`,
`agents`) et l'authentification.

- **Coût** (plan Pro, tarifs à revérifier sur supabase.com/pricing) : $25/mois par organisation,
  $10 de crédit de calcul inclus, environ $10/mois par projet → **~$115/mois à 10 clients,
  ~$515/mois à 50 clients**, pour quelques lignes par client.
- **Plan gratuit** : 2 projets maximum, mis en pause après 7 jours d'inactivité — bloquant dès le
  troisième client (le projet de test a d'ailleurs été supprimé le 2026-10-01 pour libérer une place).
- **Exploitation** : un projet par client = N migrations, N configurations d'auth, N jeux de clés.

## Décision

1. **Par défaut, tous les clients partagent un seul projet Supabase.** Chaque client reste un
   déploiement à part (son conteneur, son sous-domaine, son logo) ; ce qui est partagé, c'est la base.
2. **Chaque déploiement est verrouillé sur son workspace** par la variable `WORKSPACE_ID`
   (lue au runtime). Un workspace autre que celui-là n'existe pas pour ce déploiement : 404, même
   si l'utilisateur connecté en est membre (`getRole` dans `src/lib/auth.ts`, filtres du dashboard,
   de `/api/workspaces` et des invitations).
3. **Un projet dédié reste possible en option** (clients sensibles : gouvernement, données
   réglementées) : le back-office garde les deux modes (`database: shared | dedicated`). En mode
   dédié, `WORKSPACE_ID` est recommandé mais pas indispensable (la base ne contient qu'un workspace).

## Pourquoi c'est acceptable

- **Le schéma est déjà multi-workspace** : le starter Agent37 d'origine est multi-tenant, et
  l'isolation se fait dans le serveur (BFF), pas par la base. L'étape D l'a vérifiée (404 sur
  l'agent d'un autre utilisateur, 404 sur un workspace dont on n'est pas membre).
- **Le niveau de confiance ne change pas** : chaque conteneur porte déjà la clé Agent37 partagée par
  tous les clients. La clé service-role partagée suit la même logique : ces conteneurs sont à nous,
  pas aux clients.

## Ce qu'on accepte en échange

| Point | Conséquence | Parade |
|---|---|---|
| Isolation logique, plus physique | Un bug d'autorisation pourrait exposer un autre client | Tout passe par `getRole` (point unique) ; test d'isolation à chaque version |
| Fuite de la clé service-role d'un conteneur | Expose les données de tous les clients | Mode dédié pour les clients sensibles ; rotation de la clé possible depuis Supabase |
| Un compte par email | Une même personne chez deux clients a un seul mot de passe | Acceptable ; le dashboard ne lui montre que le workspace du déploiement |
| Migrations communes | Tous les clients voient le même schéma, même s'ils tournent sur des versions différentes du kit | **Migrations additives uniquement** (ajouter colonnes/tables, jamais renommer ni supprimer tant qu'une version déployée s'en sert) |
| Supprimer un client | Plus de « supprimer le projet » | Supprimer la ligne `workspaces` (cascade sur membres, invitations, agents) + ses utilisateurs Auth qui n'appartiennent à aucun autre client |
| Auth commune | Une seule Site URL, un seul jeu de modèles d'e-mail | Liste blanche de redirections en wildcard (`https://*.app.yelema.ai/**`) ; liens d'accès générés avec leur `redirect_to` ; e-mails au nom de Yelema |

## Impact

- **Kit (v0.1.4)** : variable `WORKSPACE_ID` ; contrat § 2 du plan mis à jour.
- **Back-office** : création, migrations, config auth et clés du projet partagé **une seule fois** ;
  créer un client = une ligne `workspaces` + son admin ; injecter `WORKSPACE_ID` dans le `.env`
  du conteneur (et l'ajouter à la liste blanche du script hôte `tenant-app-host`).
