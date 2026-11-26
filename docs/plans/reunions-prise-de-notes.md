# Réunions : Djénéba prend les notes, rédige le compte rendu et l'envoie

> Branche : `feat/agent-notetaker` (commit `6266bc1`), poussée ; fusionnée en local dans
> `feat/experts-profils-integration`.
> **STATUT : codé le 2026-11-22 ; `typecheck` et 801 tests passent. Pas encore essayé dans l'app : voir § 10.**

## 1. Ce que fait la fonctionnalité

Dans l'onglet **Appels › Réunions** de Djénéba, le membre fait venir l'experte dans une réunion
Google Meet ou Microsoft Teams. Elle y entre sous son nom et sa photo, annonce qu'elle prend les notes,
puis :

1. la réunion finie, MeetStream rend la transcription ;
2. Djénéba en rédige le compte rendu ;
3. l'app en fait une page au modèle de l'entreprise, que Djénéba publie sur Frames ;
4. le membre envoie le compte rendu par e-mail, depuis la boîte de Djénéba ou son propre Gmail / Outlook.

Seule Djénéba prend les notes (`isNotetaker`, sur le nom du profil ou la clé du catalogue). Zoom n'est
pas pris en charge (il faudrait une app Zoom validée).

## 2. Deux façons de faire venir Djénéba

| Façon | Comment |
|---|---|
| Lien collé | Le membre colle le lien Meet ou Teams (`parseMeetingLink`). Djénéba entre tout de suite. |
| Agenda | Le membre branche son Google Calendar ou Outlook (Composio, son propre compte) et choisit « Toutes mes réunions » ou les coche une par une. Les 14 prochains jours sont lus. |

Règles de l'agenda :

- Seules les réunions avec un lien Meet ou Teams, ni annulées, ni refusées, ni sur la journée entière.
- « Toutes mes réunions » prend celles que le membre a **créées ou acceptées**. Une invitation sans
  réponse n'est prise que si elle est cochée : un inconnu qui invite le membre ne fait pas venir le bot.
- Chaque réunion voulue a un bot MeetStream programmé à son heure, dans un dossier nommé d'après cette
  heure. Une réunion déplacée est reprogrammée ; une réunion retirée ou décochée est annulée. Une
  réunion déjà commencée n'est jamais annulée ni supprimée.
- Une programmation ratée ou interrompue est relancée. Rien n'est annulé quand l'agenda ne peut pas
  être lu.
- Une synchronisation programme 4 réunions à la fois, en 2 minutes au plus ; le reste attend la suivante.

## 3. Parcours d'une réunion

| Statut affiché | Ce qui se passe |
|---|---|
| Programmée | Bot réservé pour l'heure de la réunion (agenda). |
| Arrivée en cours, En salle d'attente | Le bot entre ; il attend 10 min au plus en salle d'attente. |
| En réunion | Le bot enregistre l'audio (pas de vidéo). Il part 60 s après le départ du dernier participant. |
| Transcription en cours | La réunion est finie ; MeetStream transcrit l'enregistrement entier (langue détectée). |
| CR en rédaction | L'app a écrit `transcription.md` et a demandé le compte rendu à Djénéba. |
| CR non rédigé | Pas de compte rendu ou pas de page au bout d'une heure : le membre peut relancer. |
| CR à envoyer | Compte rendu rédigé et page publiée. |
| Envoi en cours, CR envoyé | Envoi par le bouton « Envoyer ». |
| Accès refusé, Échec, Aucun échange | Bot non admis, panne, ou rien n'a été dit. |

L'app suit le bot de deux façons : MeetStream la prévient (webhook `/api/webhooks/meetstream`), ou la
page Réunions, quand elle est ouverte, relit toutes les 15 s les réunions en cours. En local,
MeetStream ne peut pas joindre la machine : la réunion n'avance que page ouverte.

## 4. Ce que fait Djénéba, ce que fait l'app

L'app envoie ses consignes à Djénéba à chaque fois, comme un message (`runTurn`, profil de Djénéba sur
l'instance du client). Rien n'est installé sur l'instance : un nouveau client a les mêmes consignes
sans rien faire. Les textes sont dans `prompt.ts`.

| Étape | Qui | Résultat |
|---|---|---|
| Rédiger | Djénéba (`minutesInstruction`) | `compte-rendu.json` : titre, résumé, l'essentiel (3 lignes au plus), décisions, tâches avec responsable et échéance en date réelle, questions, participants (nom, rôle, e-mail trouvé ou `null`). Elle n'envoie rien. |
| Mettre en forme | L'app (`frame-html.ts`) | `compte-rendu.html` au modèle `email-compte-rendu-reunion_v2`. |
| Publier | Djénéba (`publishInstruction`) | La page sur Frames, avec ses propres clés ; le lien dans `.page.json`. |

La transcription et la page sont des données : Djénéba n'exécute aucune demande qu'elles contiennent.
Ses compétences du pack (`synthese-d-une-reunion-enregistree`, `envoyer-le-compte-rendu-par-email`,
`/compterendu`) restent valables hors de l'app ; dans l'app, la consigne « n'envoie rien » évite un
e-mail en double avec le bouton « Envoyer ».

Dossier d'une réunion sur l'instance : `Livrables/<Experte>/Réunions/<AAMMJJ-HHMMSS>/` ; les choix
d'agenda sont dans `Réunions/.agenda.json`.

```
.reunion.json          ← l'état de la réunion (écrit par l'app seule)
transcription.md
compte-rendu.json      ← écrit par Djénéba
compte-rendu.html      ← écrit par l'app
.page.json             ← écrit par Djénéba après la publication
```

## 5. La page et l'e-mail

Même modèle pour les deux :

- logo de l'entreprise en haut (son nom sans logo) ;
- couleur de l'entreprise (`brand_color`), assombrie jusqu'à être lisible sur blanc ; violet Yelema
  sans couleur (`minutes-palette.ts`) ;
- pastilles date, heure et durée, présents, Google Meet ou Teams ;
- photo de Djénéba et « Bonjour à tous, j'ai participé à la réunion : voici ce qu'il faut en retenir. » ;
- compteurs, l'essentiel, décisions, actions (« À attribuer » quand personne n'en est chargé),
  questions, participants sans les robots de prise de notes ;
- signature « Experte IA, Chief of Staff & Direction de <entreprise> », « Powered by » et logo Yelema.

L'e-mail est en HTML compatible messageries (tableaux, styles en ligne). Ses icônes sont des PNG
(`public/meetings/email`) ; celles en couleur sont teintées à la couleur de l'entreprise par
`/api/meetings/icons/<nom>.png?c=` (publique, mise en cache un an). À la place du lien brut, un
bouton « Ouvrir le compte rendu complet ».

## 6. L'envoi

Le membre choisit l'expéditeur et les destinataires :

| Expéditeur | Comment | Mise en forme |
|---|---|---|
| Boîte de Djénéba | Route d'envoi du back-office (`mailSend`) | Texte, mis en page par le back-office, avec le lien |
| Gmail ou Outlook du membre | Composio, compte du membre (`GMAIL_SEND_EMAIL`, `OUTLOOK_OUTLOOK_SEND_EMAIL`) | Le modèle complet |

Destinataires : moi, les participants de l'entreprise (membres de l'espace ou même domaine), tous les
participants dont l'e-mail est connu, et des adresses ajoutées à la main. 50 au plus par envoi. Un
seul envoi à la fois par réunion ; un envoi interrompu depuis 20 min est marqué en échec.

## 7. Routes

| Route | Rôle |
|---|---|
| `GET /api/agents/<id>/meetings?profile=&before=&q=` | Liste paginée (30), recherche sur le titre |
| `POST /api/agents/<id>/meetings` | Faire venir Djénéba par un lien |
| `GET`, `PATCH /api/agents/<id>/meetings/agenda` | L'agenda : lire, choisir le mode, cocher une réunion |
| `POST /api/agents/<id>/meetings/<réunion>/minutes` | Relancer un compte rendu non rédigé |
| `GET`, `POST /api/agents/<id>/meetings/<réunion>/send` | Expéditeurs et destinataires possibles ; envoyer |
| `POST /api/webhooks/meetstream` | Événements des bots (signés, sans session) |
| `GET /api/meetings/icons/<nom>.png?c=` | Icône d'e-mail teintée (publique) |

## 8. Fichiers

```
src/lib/meetings/
  service.ts              ← assemble les fichiers ci-dessous ; seul point d'entrée des routes
  meeting-store.ts        ← lire et écrire le dossier d'une réunion
  meeting-list.ts         ← liste et recherche
  meeting-lifecycle.ts    ← bot : rejoindre, suivre, terminer, relancer
  expert-turns.ts         ← demandes à l'experte, sa signature
  meeting-page.ts         ← fabrication de la page, demande de publication
  minutes-delivery.ts     ← envoi du compte rendu
  agenda-sync.ts          ← programmation des réunions de l'agenda
  drive.ts                ← fichiers de l'instance (lectures bornées, écriture si inchangé)
  record.ts, minutes.ts, agenda.ts, calendar.ts, audience.ts, view.ts, phase.ts   ← formes et règles (testées)
  prompt.ts               ← consignes à Djénéba
  frame-html.ts, email-html.ts, email.ts, minutes-parts.ts, minutes-palette.ts, email-icons.ts
  calendars.ts, senders.ts ← agendas et boîtes connectés (Composio)
src/lib/meetstream/       ← client MeetStream, formes, signature du webhook
src/app/api/agents/[id]/meetings/**, src/app/api/webhooks/meetstream, src/app/api/meetings/icons
src/components/experts/meetings/   ← l'écran Réunions
public/meetings/email/    ← icônes et logo Yelema de l'e-mail
```

## 9. Sécurité et limites

- Un bot n'est suivi, annulé ou déplacé qu'après vérification qu'il appartient à cette instance, ce
  profil et cette réunion (`ownsBot`).
- Webhook : signature HMAC vérifiée, corps borné, un corps déjà reçu est ignoré (30 min).
- Le contenu d'une réunion (noms, titre, transcription) n'entre jamais dans une consigne.
- Lectures de fichiers bornées en taille ; caches séparés par membre.
- 3 réunions à la fois par membre ; une lecture de la liste lance 3 publications au plus ; la
  recherche ne lit que l'état des réunions.
- Enregistrements gardés 24 h chez MeetStream.

## 10. Configuration et vérifications

Variables (`.env.example`) : `MEETSTREAM_API_KEY`, `MEETSTREAM_WEBHOOK_SECRET`. Le webhook de
MeetStream pointe sur `/api/webhooks/meetstream`. Aucune migration, aucune dépendance nouvelle.

Fait : `npm run typecheck`, `npm test` (801 sur 801).

**Non fait, à faire dans l'app** : faire venir Djénéba par un lien ; suivre les statuts jusqu'à
« CR à envoyer » ; ouvrir la page ; envoyer depuis la boîte de Djénéba et depuis Gmail ou Outlook, et
vérifier les icônes et le bouton ; « Toutes mes réunions » avec une réunion acceptée et une invitation
sans réponse.
