# Clinique Startup : interface des 9 bornes

Instance spécifique pour la Clinique Startup (Ivoire Tech Forum). Elle vit sur la branche
`clinique-startup` (créée depuis `prod`) pour ne jamais toucher à l'interface Yelema.

## Ce que contient cette demande de fusion

- `public/clinique-startup/index.html` : le prototype validé par Leslie le 11/11, un seul fichier
  autonome (HTML, CSS, JS), servi sur `/clinique-startup/index.html`. Démo en ligne :
  https://leslita06.github.io/clinique-startup-parcours-2275ee/
- `public/clinique-startup/itf-logo.webp` : logo Ivoire Tech (« Powered by Ivoire Tech »).
- Aucun fichier de l'app n'est modifié.

## Le parcours

1. Accueil : 1 000 projets en 3 ans, QR du diagnostic (Tally), bouton Je commence.
2. Tu es : Étudiant, Startup ou PME.
3. Ton stade : idée (étape 1), produit (étape 5), clients (étape 7), levée (étape 9).
4. Mon parcours (tracker) : tâches faites sur 39, étapes terminées, livrables, appels, frise des
   9 étapes, cartes d'étape avec leurs tâches et « Tu repars avec ».
5. Une étape : tâches en haut, chat en bas (pleine largeur), Appeler, onglet Livrables, panneau
   « Tes livrables te suivent » (QR + documents + Recevoir par e-mail).
6. Mes livrables : rangés par étape puis par tâche, filtres (toutes, ce que j'ai, une étape).
7. Mes appels : résumé et transcript de chaque appel.
8. Clic sur le logo = accueil. Se déconnecter remet la borne à zéro.

Retiré par rapport à l'app Yelema : chat d'entreprise, Nouvelle conversation, Toutes les
conversations, E-mails, Routines, Intégrations, Yélé, « Powered by Yelema ».

## Ce qui est simulé dans le prototype (à brancher)

| Élément | Aujourd'hui | À brancher |
|---|---|---|
| Réponses du chat | phrases d'exemple tirées du playbook | l'Expert de la borne (une instance par étape, missions dans agents-bornes) |
| Livrables | fichier texte d'exemple | les fichiers produits par l'Expert (liste par tâche) |
| Appeler | phrases d'exemple | l'appel vocal existant de l'app, transcript enregistré |
| Progression | stockée dans le navigateur | par personne (session de borne), retrouvable par le QR |
| Logo Clinique Startup | provisoire | logo officiel à recevoir |

## Suite proposée

Reprendre ces écrans dans les routes de l'app (chat, livrables, appels existants) derrière un
réglage d'instance, une fois l'interface figée avec Leslie.
