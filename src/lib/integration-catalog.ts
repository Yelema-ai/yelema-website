import type { IntegrationToolkit } from "@/lib/types";

// Composio serves a logo per toolkit slug at a fixed URL scheme, so the catalog below can resolve
// app icons without a remote round-trip. Live search results carry their own `logo` from the API.
export function composioLogoUrl(slug: string) {
  return `https://logos.composio.dev/api/${slug}`;
}

function toolkit(slug: string, name: string, description: string): IntegrationToolkit {
  return {
    slug,
    name,
    description,
    logo: composioLogoUrl(slug),
    enabled: true,
    isNoAuth: false,
    authSchemes: ["OAUTH2"],
  };
}

// The tools shown before any search, with French descriptions. Search reaches the full catalog
// (1 000+ apps); a result that is also listed here keeps its French description.
export const DEFAULT_INTEGRATION_TOOLKITS: IntegrationToolkit[] = [
  toolkit("gmail", "Gmail", "Lire, trier et envoyer des e-mails"),
  toolkit("googledrive", "Google Drive", "Ranger et retrouver les fichiers"),
  toolkit("googlecalendar", "Google Agenda", "Prendre et déplacer des rendez-vous"),
  toolkit("googlesheets", "Google Sheets", "Tableaux et suivis"),
  toolkit("googledocs", "Google Docs", "Rédiger et partager des documents"),
  toolkit("outlook", "Outlook", "E-mails et agenda Microsoft 365"),
  toolkit("microsoft_teams", "Microsoft Teams", "Réunions et messages d’équipe"),
  toolkit("one_drive", "OneDrive", "Fichiers Microsoft 365"),
  toolkit("slack", "Slack", "Écrire dans vos canaux"),
  toolkit("notion", "Notion", "Lire et mettre à jour vos pages"),
  toolkit("canva", "Canva", "Créer et exporter des visuels"),
  toolkit("facebook", "Facebook", "Publier sur votre page"),
  toolkit("instagram", "Instagram", "Publier et suivre votre compte"),
  toolkit("linkedin", "LinkedIn", "Publier et suivre votre page"),
  toolkit("hubspot", "HubSpot", "Contacts, affaires et relances"),
  toolkit("airtable", "Airtable", "Bases de données d’équipe"),
  toolkit("quickbooks", "QuickBooks", "Factures et dépenses"),
  toolkit("calendly", "Calendly", "Prise de rendez-vous"),
  toolkit("zoom", "Zoom", "Réunions vidéo"),
  toolkit("dropbox", "Dropbox", "Fichiers partagés"),
  toolkit("trello", "Trello", "Tableaux de projets"),
];

const BY_SLUG = new Map(DEFAULT_INTEGRATION_TOOLKITS.map((t) => [t.slug, t]));

// The catalog entry for a slug (French name and description), if it is one of ours.
export function catalogToolkit(slug: string): IntegrationToolkit | undefined {
  return BY_SLUG.get(slug.toLowerCase());
}
