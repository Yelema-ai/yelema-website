// Mapping et gestion des tableaux de bord métier des 14 Experts Yelema.
// Référence : compétence transverse TRANS-Y1260 et DJE-Y1261.

export interface ExpertDashboardMeta {
  modelFile: string;
  title: string;
  role: string;
  reader: string;
  kpis: string[];
}

export const EXPERT_DASHBOARD_MAP: Record<string, ExpertDashboardMeta> = {
  mamadou: {
    modelFile: "finance.html",
    title: "Tableau de bord financier",
    role: "Finance et trésorerie",
    reader: "Directeur administratif et financier",
    kpis: ["Trésorerie disponible", "Point bas à 13 sem.", "Délai encaissement", "Créances > 60j", "Délai fournisseurs", "Marge brute", "Écart au budget", "Clôture du mois"],
  },
  fatima: {
    modelFile: "marketing.html",
    title: "Tableau de bord marketing",
    role: "Marketing et contenu",
    reader: "Directrice marketing",
    kpis: ["Portée totale", "Interactions", "Taux d’engagement", "Abonnés gagnés", "Contacts obtenus", "Coût par contact", "Calendrier tenu", "Newsletter"],
  },
  adjoua: {
    modelFile: "recrutement.html",
    title: "Tableau de bord recrutement",
    role: "Recrutement et talents",
    reader: "Responsable recrutement",
    kpis: ["Postes ouverts", "Délai pour pourvoir", "Candidatures", "Candidats / embauche", "Offres acceptées", "Réponse candidats", "Essai validé", "Coût / embauche"],
  },
  kouassi: {
    modelFile: "commercial.html",
    title: "Tableau de bord commercial",
    role: "Commercial et ventes",
    reader: "Responsable commerciale",
    kpis: ["Pipeline ouvert", "Couverture objectif", "Taux de gain", "Cycle de vente", "Montant moyen gagné", "Devis sans réponse", "Demandes entrantes", "Première réponse"],
  },
  ibrahim: {
    modelFile: "juridique.html",
    title: "Tableau de bord juridique",
    role: "Juridique et conformité",
    reader: "Juriste d’entreprise",
    kpis: ["Contrats actifs", "Premier projet", "Jusqu’à signature", "Écarts clauses types", "Préavis dans 90j", "Obligations tenues", "Traitements ARTCI", "Recouvrement"],
  },
  salif: {
    modelFile: "operations.html",
    title: "Tableau de bord des opérations",
    role: "Opérations et logistique",
    reader: "Responsable des opérations",
    kpis: ["Livrées à temps", "Taux de service", "Jours de stock", "Articles sous seuil", "Lots proches limite", "Rotation stocks", "Rendement ligne", "Coût livraison"],
  },
  djeneba: {
    modelFile: "direction.html",
    title: "Tableau de bord de direction",
    role: "Chief of Staff & Direction",
    reader: "Dirigeant",
    kpis: ["Objectifs trimestre", "Engagements tenus", "Engagements retard", "Décisions en attente", "Relevés jour même", "Rendez-vous préparés", "Temps en réunion"],
  },
  nadia: {
    modelFile: "data.html",
    title: "Tableau de bord data & analyse",
    role: "Données et analyse",
    reader: "Responsable des données",
    kpis: ["Sources à jour", "Champs complets", "Doublons détectés", "Lignes valides", "Mises à jour réussies", "Rapports livrés", "Écart prévision", "Points suivis"],
  },
  awa: {
    modelFile: "support.html",
    title: "Tableau de bord service client",
    role: "Support et relation client",
    reader: "Responsable service client",
    kpis: ["Demandes reçues", "Première réponse", "Résolues par l’Expert", "Résolution 1er contact", "Temps résolution", "Satisfaction client", "Demandes rouvertes"],
  },
  fatou: {
    modelFile: "rh-paie.html",
    title: "Tableau de bord RH et paie",
    role: "Ressources humaines et paie",
    reader: "Responsable RH",
    kpis: ["Effectif total", "Entrées et sorties", "Masse salariale brute", "Bulletins sans erreur", "Payés à l’heure", "Absences hors congés", "Rotation 12 mois", "Dossiers complets"],
  },
  koffi: {
    modelFile: "design.html",
    title: "Tableau de bord design & marque",
    role: "Design et image de marque",
    reader: "Responsable de marque",
    kpis: ["Créations livrées", "Livrées à l’heure", "Validées 1er jet", "Délai moyen", "Demandes en file", "Conformes charte", "Faites sur modèle", "Satisfaction"],
  },
  alioune: {
    modelFile: "investissement.html",
    title: "Tableau de bord investissement",
    role: "Investissement",
    reader: "Direction investissement",
    kpis: ["Dossiers triés", "En instruction", "Délai instruction", "Salles complètes", "Participations suivies", "Participations alerte", "Reportings reçus", "Contrôles KYC"],
  },
  blok: {
    modelFile: "travaux.html",
    title: "Tableau de bord travaux",
    role: "Travaux et chantiers",
    reader: "Directeur des travaux",
    kpis: ["Chantiers suivis", "Budget engagé", "Écart de coût", "Devis comparés", "Factures contrôlées", "Livraisons rapprochées", "Économie négociée", "Retard moyen"],
  },
  danaya: {
    modelFile: "conformite.html",
    title: "Tableau de bord conformité",
    role: "Conformité",
    reader: "Responsable conformité",
    kpis: ["Entrées en relation", "Alertes criblage", "Revues dues", "Pièces expirées", "Clients risque élevé", "Soupçons instruction", "Agents formés", "Prochaine échéance"],
  },
  konan: {
    modelFile: "konan.html",
    title: "Tableau de bord accompagnement startups",
    role: "Programmes startups",
    reader: "Responsable de programme",
    kpis: ["Startups suivies", "Jalons atteints", "Reportings reçus", "Sessions tenues", "Startups en alerte", "Mises en relation"],
  },
  lokoli: {
    modelFile: "lokoli.html",
    title: "Tableau de bord cabinet",
    role: "Directeur de cabinet",
    reader: "Directeur de cabinet",
    kpis: ["Dossiers suivis", "Engagements en cours", "Sollicitations reçues", "Rendez-vous", "Notes préparées", "Contrôles qualité"],
  },
  benkan: {
    modelFile: "benkan.html",
    title: "Tableau de bord affaires étrangères",
    role: "Affaires étrangères",
    reader: "Directeur de cabinet",
    kpis: ["Dossiers diplomatiques", "Notes de cadrage", "Accords suivis", "Visites officielles"],
  },
  yiriwa: {
    modelFile: "yiriwa.html",
    title: "Tableau de bord transition numérique",
    role: "Innovation et technologie",
    reader: "Directeur de cabinet",
    kpis: ["Projets tech suivis", "Taux de digitalisation", "Infrastructures", "Formations numériques"],
  },
};

/**
 * Normalise un nom ou profileId pour trouver le modèle correspondant.
 */
export function getDashboardMeta(profileId: string | null | undefined): ExpertDashboardMeta | null {
  if (!profileId || typeof profileId !== "string") return null;
  const trimmed = profileId.trim();
  // Protection stricte anti-traversée de chemin : rejeter toute tentative avec slash, anti-slash ou points
  if (trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("..")) {
    return null;
  }
  const noVersion = trimmed.split("@")[0] ?? trimmed;
  const raw = noVersion.toLowerCase().replace(/^.*__/, "");
  // Doit être un identifiant strict sans caractères parasites
  if (!/^[a-z0-9_-]+$/.test(raw)) {
    return null;
  }
  return EXPERT_DASHBOARD_MAP[raw] ?? null;
}

export const TRUSTED_FRAME_REGEX =
  /^https:\/\/(?:mstudio-frames\.onrender\.com|yelema-dashboards\.onrender\.com)\/share\/frame\/[0-9a-fA-F\-]{36}$/;

/** "pdf" or "html" for a deliverable path an expert wrote under Livrables/; null for anything else. */
export function deliverableKind(path: unknown): "pdf" | "html" | null {
  if (typeof path !== "string" || path.length > 512 || !path.startsWith("Livrables/")) return null;
  if (path.includes("..") || path.includes("\\") || path.includes("//")) return null;
  const ext = /\.(pdf|html?)$/i.exec(path)?.[1]?.toLowerCase();
  return ext === "pdf" ? "pdf" : ext ? "html" : null;
}

export function isTrustedDashboardUrl(url: unknown): url is string {
  return typeof url === "string" && TRUSTED_FRAME_REGEX.test(url.trim());
}

/**
 * Chemins d'emplacement candidats du fichier d'état du tableau de bord sur l'instance Agent37.
 */
export function getDashboardStateCandidatePaths(profile: string, folders: readonly string[] = []): string[] {
  const capitalized = profile ? profile.charAt(0).toUpperCase() + profile.slice(1).toLowerCase() : "";
  return [
    // The expert's drive folder is its name (« Djénéba »), not its profile (« unifood__djeneba »).
    ...folders.map((f) => `Livrables/${f}/_memoire/state/tableau-de-bord-metier.json`),
    `Livrables/${capitalized}/_memoire/state/tableau-de-bord-metier.json`,
    `Livrables/${profile}/_memoire/state/tableau-de-bord-metier.json`,
    `memory/state/tableau-de-bord-metier.json`,
    `memory/state/${profile}/tableau-de-bord-metier.json`,
    `.hermes/profiles/${profile}/memory/state/tableau-de-bord-metier.json`,
  ];
}

/** The expert's dashboard state file: only where the dashboard is, never who may read it (that is the back office's). */
export interface StoredDashboardState {
  lien?: string | null;
  hebergeur?: string | null;
  maj?: string | null;
  pdfPath?: string | null;
  htmlPath?: string | null;
  fichiers?: string | null;
  [key: string]: unknown;
}
