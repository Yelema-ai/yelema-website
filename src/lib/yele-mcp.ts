// Protocole MCP JSON-RPC 2.0 pour Yélé (Supervision, Observabilité & Analytique).
// Expose 6 super-pouvoirs en lecture seule (read-only) pour inspecter l'instance en toute sécurité.

export const YELE_TOOLS = [
  {
    name: "analyser_activite_experts",
    description:
      "Inspecte l'activité récente des experts de l'entreprise : qui a travaillé aujourd'hui, qui est inactif, le nombre de tâches/sessions traitées et la dernière heure d'activité.",
    inputSchema: {
      type: "object",
      properties: {
        periode: {
          type: "string",
          enum: ["aujourdhui", "7_jours", "30_jours"],
          description: "La période d'analyse (par défaut 'aujourdhui').",
        },
      },
    },
  },
  {
    name: "lire_rapport_journalier",
    description:
      "Lit le rapport journalier (daily log) généré par le plugin Hermes Memory / Wiki pour une date donnée. Donne le compte-rendu des actions réalisées, des décisions et des apprentissages clés.",
    inputSchema: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "La date au format YYYY-MM-DD, ou 'aujourdhui', ou 'hier'.",
        },
      },
    },
  },
  {
    name: "auditer_outils_connecteurs",
    description:
      "Vérifie l'état de santé de tous les connecteurs (Composio, MCP, Telegram) et liste les outils associés à chaque expert (actifs, déconnectés ou en échec).",
    inputSchema: {
      type: "object",
      properties: {
        expert: {
          type: "string",
          description: "Optionnel : filtrer pour un expert précis (ex: 'fatima', 'kouassi').",
        },
      },
    },
  },
  {
    name: "consulter_livrables_recents",
    description:
      "Liste les derniers livrables et documents produits par les experts dans le dossier Livrables (Word, Excel, PowerPoint, PDF), avec nom, auteur, date et taille.",
    inputSchema: {
      type: "object",
      properties: {
        limite: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          description: "Nombre maximum de livrables à retourner (défaut: 10).",
        },
      },
    },
  },
  {
    name: "statistiques_et_analytique",
    description:
      "Fournit une analyse chiffrée et des statistiques globales sur l'équipe d'experts : répartition de l'activité, taux de réussite des routines, volume de production et tendances d'usage.",
    inputSchema: {
      type: "object",
      properties: {
        vue: {
          type: "string",
          enum: ["synthese", "routines", "usage"],
          description: "La vue analytique souhaitée (défaut 'synthese').",
        },
      },
    },
  },
  {
    name: "consulter_canaux_et_telegram",
    description:
      "Consulte la configuration et l'état des canaux de communication de l'équipe : groupe Telegram du forum Yelema, bot Telegram officiel, association des topics/fils par expert, lien d'invitation et adresses e-mail d'entreprise (@agentmail.to).",
    inputSchema: {
      type: "object",
      properties: {
        expert: {
          type: "string",
          description: "Optionnel : nom ou identifiant de l'expert (ex: 'djeneba', 'koffi') pour son topic et e-mail dédié.",
        },
      },
    },
  },
  {
    name: "analyser_consommation_tokens_et_couts",
    description:
      "Analyse la consommation de tokens d'IA, les volumes d'inférence et la distribution des modèles (Claude Opus 5.5, default) pour chaque expert ou pour toute l'instance. Permet de savoir qui consomme le plus/moins, les moyennes par routine et la durée des exécutions.",
    inputSchema: {
      type: "object",
      properties: {
        expert: {
          type: "string",
          description: "Optionnel : nom ou identifiant de l'expert pour un audit détaillé de sa consommation.",
        },
      },
    },
  },
  {
    name: "consulter_alertes_et_incidents",
    description:
      "Supervise la santé du système, surveille les alertes opérationnelles et détecte les incidents : échecs de crons ou routines, connecteurs non connectés ou défaillants, et statut des passerelles de messagerie.",
    inputSchema: {
      type: "object",
      properties: {
        expert: {
          type: "string",
          description: "Optionnel : filtrer les alertes et l'état de santé pour un expert précis.",
        },
      },
    },
  },
  {
    name: "consulter_appels_et_voix",
    description:
      "Consulte la configuration du canal vocal, le statut des appels et les derniers briefs d'avant-appel préparés automatiquement pour les experts (contexte récent, dernières tâches et historique).",
    inputSchema: {
      type: "object",
      properties: {
        expert: {
          type: "string",
          description: "Optionnel : nom ou identifiant de l'expert pour son brief d'appel, ou laisser vide pour toute l'équipe.",
        },
      },
    },
  },
  {
    name: "rechercher_dans_la_memoire",
    description:
      "Recherche un terme, un sujet ou une information clé dans les mémoires durables d'entreprise et les historiques de tous les experts (ou d'un expert précis). Idéal pour retrouver des décisions, des consignes ou des faits sans chercher date par date.",
    inputSchema: {
      type: "object",
      properties: {
        requete: {
          type: "string",
          description: "Le mot-clé ou la phrase à rechercher (ex: 'réunion', 'budget', 'client', 'partenariat').",
        },
        expert: {
          type: "string",
          description: "Optionnel : limiter la recherche à un expert précis.",
        },
      },
      required: ["requete"],
    },
  },
  {
    name: "consulter_skills_experts",
    description:
      "Consulte le référentiel des compétences métiers (skills), méthodologies et modes opératoires déclarés pour chaque expert (ou pour un expert précis).",
    inputSchema: {
      type: "object",
      properties: {
        expert: {
          type: "string",
          description: "Optionnel : nom ou identifiant de l'expert pour détailler ses compétences métiers.",
        },
      },
    },
  },
  {
    name: "trouver_une_commande",
    description:
      "Trouve la commande d'Expert qui répond à un besoin (« comment je fais pour préparer un devis ? ») : quel Expert, le nom de la commande en mots, ce qu'elle fait, un exemple et ce qu'il faut préciser. Sans besoin, liste les commandes de chaque Expert. À utiliser avant de citer une commande : n'en citer aucune autre.",
    inputSchema: {
      type: "object",
      properties: {
        besoin: { type: "string", description: "Ce que l'utilisateur veut faire, en ses mots (ex: 'relancer un client', 'faire un devis')." },
        expert: { type: "string", description: "Optionnel : limiter à un Expert (ex: 'koffi')." },
      },
    },
  },
  {
    name: "diagnostiquer_configuration",
    description:
      "Diagnostique la configuration générale de l'instance Hermes en toute sécurité (clés d'API et secrets automatiquement masqués). Vérifie les passerelles actives, les modèles configurés et la mémoire.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
] as const;

export interface YeleBackend {
  analyserActivite(periode?: string): Promise<string>;
  lireRapportJournalier(date?: string): Promise<string>;
  auditerOutils(expert?: string): Promise<string>;
  consulterLivrables(limite?: number): Promise<string>;
  statistiquesAnalytique(vue?: string): Promise<string>;
  diagnostiquerConfiguration(): Promise<string>;
  consulterCanauxTelegram(expert?: string): Promise<string>;
  analyserConsommationTokens(expert?: string): Promise<string>;
  consulterAlertesIncidents(expert?: string): Promise<string>;
  consulterAppelsEtVoix(expert?: string): Promise<string>;
  rechercherDansLaMemoire(requete: string, expert?: string): Promise<string>;
  consulterSkillsExperts(expert?: string): Promise<string>;
  trouverCommande(besoin?: string, expert?: string): Promise<string>;
}

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
type RpcAnswer = { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string } };

const text = (value: string, isError = false) => ({
  content: [{ type: "text", text: value }],
  ...(isError ? { isError: true } : {}),
});

async function callTool(backend: YeleBackend, name: unknown, args: Record<string, unknown>) {
  switch (name) {
    case "analyser_activite_experts": {
      const p = typeof args.periode === "string" ? args.periode : undefined;
      return text(await backend.analyserActivite(p));
    }
    case "lire_rapport_journalier": {
      const d = typeof args.date === "string" ? args.date : undefined;
      return text(await backend.lireRapportJournalier(d));
    }
    case "auditer_outils_connecteurs": {
      const e = typeof args.expert === "string" ? args.expert : undefined;
      return text(await backend.auditerOutils(e));
    }
    case "consulter_livrables_recents": {
      const l = typeof args.limite === "number" ? args.limite : undefined;
      return text(await backend.consulterLivrables(l));
    }
    case "statistiques_et_analytique": {
      const v = typeof args.vue === "string" ? args.vue : undefined;
      return text(await backend.statistiquesAnalytique(v));
    }
    case "consulter_canaux_et_telegram": {
      const e = typeof args.expert === "string" ? args.expert : undefined;
      return text(await backend.consulterCanauxTelegram(e));
    }
    case "analyser_consommation_tokens_et_couts": {
      const e = typeof args.expert === "string" ? args.expert : undefined;
      return text(await backend.analyserConsommationTokens(e));
    }
    case "consulter_alertes_et_incidents": {
      const e = typeof args.expert === "string" ? args.expert : undefined;
      return text(await backend.consulterAlertesIncidents(e));
    }
    case "consulter_appels_et_voix": {
      const e = typeof args.expert === "string" ? args.expert : undefined;
      return text(await backend.consulterAppelsEtVoix(e));
    }
    case "rechercher_dans_la_memoire": {
      const q = typeof args.requete === "string" ? args.requete : "";
      const e = typeof args.expert === "string" ? args.expert : undefined;
      return text(await backend.rechercherDansLaMemoire(q, e));
    }
    case "consulter_skills_experts": {
      const e = typeof args.expert === "string" ? args.expert : undefined;
      return text(await backend.consulterSkillsExperts(e));
    }
    case "trouver_une_commande": {
      const b = typeof args.besoin === "string" ? args.besoin : undefined;
      const e = typeof args.expert === "string" ? args.expert : undefined;
      return text(await backend.trouverCommande(b, e));
    }
    case "diagnostiquer_configuration": {
      return text(await backend.diagnostiquerConfiguration());
    }
    default:
      return text("Outil inconnu.", true);
  }
}

/**
 * Traite un message JSON-RPC 2.0 pour le serveur MCP Yélé.
 */
export async function answerRpc(message: unknown, backend: YeleBackend): Promise<RpcAnswer | null> {
  const rpc = (message && typeof message === "object" ? message : {}) as Rpc;
  const id = rpc.id ?? null;
  if (rpc.jsonrpc !== "2.0" || typeof rpc.method !== "string") {
    return { jsonrpc: "2.0", id, error: { code: -32600, message: "Invalid Request" } };
  }
  if (rpc.id === undefined) return null;
  const ok = (result: unknown): RpcAnswer => ({ jsonrpc: "2.0", id, result });

  switch (rpc.method) {
    case "initialize":
      return ok({
        protocolVersion: typeof rpc.params?.protocolVersion === "string" ? rpc.params.protocolVersion : "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "yele-supervision", version: "1.0.0" },
      });
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: YELE_TOOLS });
    case "tools/call": {
      const args = rpc.params?.arguments;
      try {
        return ok(await callTool(backend, rpc.params?.name, args && typeof args === "object" ? (args as Record<string, unknown>) : {}));
      } catch (e) {
        if ((e as { status?: number }).status === 401) throw e;
        return ok(text(e instanceof Error && e.message ? e.message : "Erreur lors de l'exécution de l'outil.", true));
      }
    }
    default:
      return { jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } };
  }
}
