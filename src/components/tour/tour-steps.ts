// The guided tour, in order. Each step points at the element carrying `data-tour="<id>"`, on the screen named
// by `page`. `menu` steps need the menu open; `click` steps open what they point at (a tab), never anything
// that sends, connects or changes; `follows` steps are on what the click before opened (several in a row:
// whichever is displayed). Texts are shown as plain text.

export type TourPage = "home" | "expert" | "integrations";
export type TourSide = "top" | "right" | "bottom" | "left";

export interface TourStep {
  id: string;
  page: TourPage;
  title: string;
  text: string;
  side: TourSide;
  menu?: true;
  click?: true;
  follows?: true;
}

export const TOUR_STEPS: readonly TourStep[] = [
  { id: "home-composer", page: "home", side: "bottom", title: "Confiez une tâche", text: "Écrivez ici ce que vous voulez confier à vos Experts, puis envoyez : ils s’en chargent et vous répondent." },
  { id: "nav-new", page: "home", side: "right", menu: true, title: "Nouvelle conversation", text: "Revenez ici à tout moment pour démarrer une nouvelle demande." },
  { id: "nav-search", page: "home", side: "right", menu: true, title: "Rechercher", text: "Retrouvez une conversation ou un document en quelques lettres. Raccourci : Ctrl K." },
  { id: "nav-experts", page: "home", side: "right", menu: true, title: "Mes Experts", text: "Votre équipe d’Experts IA. Cliquez sur l’un d’eux pour ouvrir son espace de travail. Ouvrons-en un." },

  { id: "expert-tab-chat", page: "expert", side: "bottom", click: true, title: "Discussion", text: "Parlez à votre Expert comme à un collègue : demandez, précisez, joignez vos fichiers." },
  { id: "chat-attach", page: "expert", side: "top", follows: true, title: "Joindre des fichiers", text: "Le trombone : donnez à votre Expert un contrat, un tableur, une présentation… il les lit et s’en sert." },
  { id: "expert-tab-files", page: "expert", side: "bottom", click: true, title: "Livrables", text: "Tous les documents que votre Expert a produits pour vous, prêts à ouvrir ou à télécharger." },
  { id: "files-import", page: "expert", side: "bottom", follows: true, title: "Importer", text: "Déposez ici vos propres fichiers ou dossiers : votre Expert peut les lire." },
  { id: "expert-tab-calls", page: "expert", side: "bottom", click: true, title: "Appels", text: "Appelez votre Expert de vive voix et retrouvez vos échanges passés." },
  { id: "expert-call", page: "expert", side: "bottom", title: "Appeler", text: "Lancez un appel : votre Expert vous répond de vive voix. Le résumé de l’appel arrive dans Appels." },
  { id: "expert-tab-emails", page: "expert", side: "bottom", click: true, title: "E-mails", text: "Votre Expert a sa propre adresse e-mail : il envoie et reçoit lui-même ses e-mails. Vous les retrouvez ici." },
  { id: "expert-mail-create", page: "expert", side: "bottom", follows: true, title: "Créer son adresse e-mail", text: "Créez l’adresse e-mail de votre Expert : elle est à lui, il s’en sert pour envoyer et recevoir ses e-mails." },
  { id: "expert-mail-new", page: "expert", side: "bottom", follows: true, title: "Nouveau message", text: "Faites envoyer un e-mail par votre Expert, depuis sa propre adresse." },
  { id: "expert-tab-routines", page: "expert", side: "bottom", click: true, title: "Routines", text: "Automatisez vos tâches : votre Expert les fait seul, à l’heure choisie ou quand un événement arrive." },
  { id: "routine-new", page: "expert", side: "bottom", follows: true, title: "Automatiser une tâche", text: "Un rapport chaque lundi, un suivi après chaque e-mail reçu… choisissez quand la tâche se lance et ce que votre Expert doit faire." },

  { id: "int-tab-connecteurs", page: "integrations", side: "bottom", click: true, title: "Connecteurs", text: "Branchez vos outils (Gmail, Google Drive, Outlook…) pour que vos Experts travaillent avec." },
  { id: "connector-search", page: "integrations", side: "bottom", follows: true, title: "Ajouter un outil", text: "Cherchez un outil (Gmail, Google Drive, HubSpot…) et cliquez sur Connecter : vos Experts peuvent s’en servir." },
  { id: "int-tab-canaux", page: "integrations", side: "bottom", click: true, title: "Canaux", text: "Parlez à vos Experts depuis Telegram, WhatsApp, Slack ou Teams." },
  { id: "channel-list", page: "integrations", side: "top", follows: true, title: "Connecter une messagerie", text: "Choisissez une messagerie et suivez les étapes : vous écrivez ensuite à vos Experts depuis votre téléphone." },
  { id: "int-tab-emails", page: "integrations", side: "bottom", click: true, title: "E-mails", text: "Attribuez une adresse e-mail aux Experts de chaque membre et choisissez lesquels peuvent écrire." },
  { id: "int-tab-modeles", page: "integrations", side: "bottom", click: true, title: "Modèles", text: "Choisissez le modèle d’intelligence artificielle sur lequel travaillent vos Experts." },
  { id: "model-add", page: "integrations", side: "bottom", follows: true, title: "Ajouter un compte", text: "Branchez votre propre compte d’IA : une clé, un abonnement ou un serveur privé. Sans compte, vos Experts utilisent le moteur Yelema." },
  { id: "int-tab-mcp", page: "integrations", side: "bottom", click: true, title: "MCP", text: "Branchez sur vos Experts vos propres serveurs d’outils." },
  { id: "mcp-add", page: "integrations", side: "bottom", follows: true, title: "Brancher votre MCP", text: "Cliquez sur « Ajouter un outil », donnez un nom et l’adresse https de votre serveur : vos Experts reçoivent ses outils." },
  { id: "int-tab-identifiants", page: "integrations", side: "bottom", click: true, title: "Accès aux sites", text: "Confiez à un Expert l’accès à un site : il s’y connecte pour vous, sans jamais voir le mot de passe." },
  { id: "vault-add", page: "integrations", side: "bottom", follows: true, title: "Ajouter un accès", text: "Indiquez le site, l’identifiant, le mot de passe et à quoi sert cet accès." },
  { id: "nav-integrations", page: "integrations", side: "right", menu: true, title: "Intégrations", text: "Tout ce qui se branche sur vos Experts se règle ici, à tout moment." },
  { id: "nav-salons", page: "integrations", side: "right", menu: true, title: "Salons", text: "Échangez à plusieurs, entre collègues et avec vos Experts." },
  { id: "nav-equipe", page: "integrations", side: "right", menu: true, title: "Mon équipe", text: "Les membres de votre équipe et les Experts ouverts à chacun." },
  { id: "nav-conversations", page: "integrations", side: "right", menu: true, title: "Toutes les conversations", text: "L’historique complet de vos échanges avec vos Experts." },
  { id: "nav-account", page: "integrations", side: "right", menu: true, title: "Votre compte", text: "Votre profil, vos paramètres et vos notifications. Vous êtes prêt : bonne découverte !" },
];

export const tourSelector = (step: Pick<TourStep, "id">) => `[data-tour="${step.id}"]`;
