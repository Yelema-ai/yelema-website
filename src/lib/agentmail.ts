import { AgentMailClient } from "agentmail";
import { ApiError } from "@/lib/http";
import { getExpert } from "@/config/experts";

let _client: AgentMailClient | null = null;

export function getAgentMailClient(): AgentMailClient {
  const apiKey = process.env.AGENTMAIL_API_KEY?.trim();
  if (!apiKey) {
    throw new ApiError(503, "agentmail_not_configured", "La clé d'API AgentMail n'est pas configurée");
  }
  if (!_client) {
    _client = new AgentMailClient({ apiKey });
  }
  return _client;
}

export function isAgentMailConfigured(): boolean {
  return Boolean(process.env.AGENTMAIL_API_KEY?.trim());
}

/**
 * Nettoie le nom d'affichage pour respecter les contraintes strictes d'AgentMail
 * (AgentMail n'autorise pas les parenthèses () ou certains caractères spéciaux).
 */
export function sanitizeDisplayName(name?: string): string {
  if (!name) return "Expert";
  return name.replace(/[()\[\]{}<>&"'/\\@:;,?!=+*#~`%$^|]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Format normalisé pour le username de la boîte e-mail d'un expert.
 * Ex: 'djeneba.mstudio' ou 'djeneba'
 */
export function getExpertInboxUsername(expertKey: string, workspaceSlug?: string): string {
  const cleanKey = expertKey.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!workspaceSlug || workspaceSlug === "default") {
    return cleanKey;
  }
  const cleanSlug = workspaceSlug.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${cleanKey}.${cleanSlug}`;
}

export interface ExpertInboxInfo {
  inboxId: string;
  email: string;
  displayName: string;
  createdAt: string;
  statusUntil?: string;
  expertKey: string;
}

/**
 * Récupère ou provisionne la boîte e-mail d'un expert chez AgentMail.
 */
export async function getOrCreateExpertInbox(
  expertKey: string,
  workspaceSlug?: string,
  customDisplayName?: string
): Promise<ExpertInboxInfo> {
  const client = getAgentMailClient();
  const expert = getExpert(expertKey);
  const rawDisplayName = customDisplayName || (expert ? `${expert.name} - ${expert.role}` : `Expert ${expertKey}`);
  const displayName = sanitizeDisplayName(rawDisplayName);
  const username = getExpertInboxUsername(expertKey, workspaceSlug);
  const expectedInboxId = `${username}@agentmail.to`;

  // 1. Chercher si la boîte existe déjà par son identifiant complet
  try {
    const existing = await client.inboxes.get(expectedInboxId);
    if (existing && existing.inboxId) {
      return {
        inboxId: existing.inboxId,
        email: existing.email || (existing as any).inbox_id || expectedInboxId,
        displayName: existing.displayName || displayName,
        createdAt: (existing as any).createdAt || (existing as any).created_at || new Date().toISOString(),
        statusUntil: (existing as any).statusUntil || (existing as any).status_until,
        expertKey,
      };
    }
  } catch {
    // Si non trouvée (404), on passe à la vérification par liste
  }

  // 2. Chercher dans la liste existante
  try {
    const list = await client.inboxes.list({ limit: 50 });
    const found = list.inboxes?.find(
      (i) => i.inboxId === expectedInboxId || i.email === expectedInboxId || i.inboxId.startsWith(`${username}@`)
    );
    if (found) {
      return {
        inboxId: found.inboxId,
        email: found.email || (found as any).inbox_id || expectedInboxId,
        displayName: found.displayName || displayName,
        createdAt: (found as any).createdAt || (found as any).created_at || new Date().toISOString(),
        statusUntil: (found as any).statusUntil || (found as any).status_until,
        expertKey,
      };
    }
  } catch {
    // Ignorer
  }

  // 3. Créer la boîte e-mail chez AgentMail
  try {
    const created = await client.inboxes.create({
      username,
      displayName,
      metadata: {
        expertKey,
        workspaceSlug: workspaceSlug || "default",
      },
    });

    return {
      inboxId: created.inboxId,
      email: created.email || (created as any).inbox_id || expectedInboxId,
      displayName: created.displayName || displayName,
      createdAt: (created as any).createdAt || (created as any).created_at || new Date().toISOString(),
      statusUntil: (created as any).statusUntil || (created as any).status_until,
      expertKey,
    };
  } catch (err: any) {
    console.error(`[AgentMail] Erreur création inbox pour ${expertKey}:`, err);
    const detailMessage = err.body?.errors?.[0]?.message || err.body?.message || err.message || String(err);
    throw new ApiError(500, "agentmail_error", `Impossible de créer la boîte e-mail de l'expert : ${detailMessage}`);
  }
}

/**
 * Envoie un e-mail au nom d'un expert.
 */
export async function sendExpertEmail(
  inboxId: string,
  params: {
    to: string;
    subject: string;
    text?: string;
    html?: string;
    cc?: string[];
    bcc?: string[];
    attachments?: Array<{ filename: string; content: string; contentType?: string }>;
  }
) {
  const client = getAgentMailClient();

  if (!params.to) {
    throw new ApiError(400, "invalid_request", "Le destinataire (to) est obligatoire");
  }
  if (!params.subject) {
    throw new ApiError(400, "invalid_request", "L'objet de l'e-mail (subject) est obligatoire");
  }

  const plainText = params.text || (params.html ? params.html.replace(/<[^>]+>/g, "") : "");
  const htmlContent = params.html || `<div style="font-family: sans-serif; line-height: 1.6;">${params.text?.replace(/\n/g, "<br/>")}</div>`;

  const sent = await client.inboxes.messages.send(inboxId, {
    to: params.to,
    subject: params.subject,
    text: plainText,
    html: htmlContent,
    cc: params.cc,
    bcc: params.bcc,
    attachments: params.attachments as any,
  });

  return sent;
}

/**
 * Liste les e-mails reçus/envoyés par la boîte d'un expert.
 */
export async function listExpertMessages(inboxId: string, limit: number = 20) {
  const client = getAgentMailClient();
  const res = await client.inboxes.messages.list(inboxId, { limit });
  return res.messages || [];
}

/**
 * Récupère un e-mail spécifique avec extraction de contenu nettoyé.
 */
export async function getExpertMessage(inboxId: string, messageId: string) {
  const client = getAgentMailClient();
  const msg = await client.inboxes.messages.get(inboxId, messageId);
  return msg;
}

/**
 * Répond à un e-mail dans un fil existant.
 */
export async function replyToExpertMessage(
  inboxId: string,
  messageId: string,
  params: {
    text?: string;
    html?: string;
    attachments?: Array<{ filename: string; content: string; contentType?: string }>;
  }
) {
  const client = getAgentMailClient();
  const plainText = params.text || (params.html ? params.html.replace(/<[^>]+>/g, "") : "");
  const reply = await client.inboxes.messages.reply(inboxId, messageId, {
    text: plainText,
    html: params.html,
    attachments: params.attachments as any,
  });
  return reply;
}
