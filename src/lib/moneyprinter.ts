import { withTimeout, JSON_TIMEOUT_MS } from "./fetch-timeout.ts";

export type VideoAspect = "9:16" | "16:9" | "1:1";
export type TaskStatus = "pending" | "processing" | "completed" | "failed";

export class MoneyPrinterError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "MoneyPrinterError";
    this.status = status;
    this.code = code;
  }
}

export interface MoneyPrinterConfig {
  apiUrl: string;
  apiKey?: string;
  defaultVoice: string;
  defaultAspect: VideoAspect;
  timeoutMs: number;
}

export interface GenerateVideoParams {
  subject: string;
  script?: string;
  aspect?: VideoAspect;
  voiceName?: string;
  subtitleEnabled?: boolean;
  videoCount?: number;
}

export interface VideoTaskResponse {
  taskId: string;
  status: TaskStatus;
}

export interface VideoTaskStatus {
  taskId: string;
  status: TaskStatus;
  progress: number;
  videoUrl: string | null;
  error: string | null;
}

export interface GenerateScriptParams {
  subject: string;
  customSystemPrompt?: string;
  customScriptPrompt?: string;
}

const ALLOWED_ASPECTS = new Set<VideoAspect>(["9:16", "16:9", "1:1"]);
const TASK_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

/**
 * Charge la configuration MoneyPrinterTurbo depuis l'environnement.
 * Retourne null si le service n'est pas activé / configuré.
 */
export function getMoneyPrinterConfig(): MoneyPrinterConfig | null {
  const rawUrl = process.env.MONEYPRINTER_API_URL?.trim();
  if (!rawUrl) return null;

  try {
    const parsed = new URL(rawUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("Protocole URL invalide");
    }
  } catch {
    throw new MoneyPrinterError(
      500,
      "config_error",
      "L'URL du service MoneyPrinterTurbo (MONEYPRINTER_API_URL) est invalide."
    );
  }

  const apiKey = process.env.MONEYPRINTER_API_KEY?.trim() || undefined;
  const defaultVoice = process.env.MONEYPRINTER_DEFAULT_VOICE?.trim() || "fr-FR-VivienneMultilingualNeural";

  const rawAspect = process.env.MONEYPRINTER_DEFAULT_ASPECT?.trim() as VideoAspect;
  const defaultAspect: VideoAspect = ALLOWED_ASPECTS.has(rawAspect) ? rawAspect : "9:16";

  const rawTimeout = process.env.MONEYPRINTER_TIMEOUT_MS?.trim();
  const parsedTimeout = rawTimeout ? parseInt(rawTimeout, 10) : NaN;
  const timeoutMs = Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : JSON_TIMEOUT_MS;

  return {
    apiUrl: rawUrl.replace(/\/+$/, ""),
    apiKey,
    defaultVoice,
    defaultAspect,
    timeoutMs,
  };
}

/**
 * Valide et assainit les paramètres d'entrée pour la création d'une vidéo.
 */
export function sanitizeVideoParams(params: GenerateVideoParams, config: MoneyPrinterConfig) {
  const subject = params.subject?.trim();
  if (!subject) {
    throw new MoneyPrinterError(400, "invalid_subject", "Le sujet de la vidéo est obligatoire.");
  }
  if (subject.length > 500) {
    throw new MoneyPrinterError(400, "subject_too_long", "Le sujet de la vidéo ne peut pas dépasser 500 caractères.");
  }

  const aspect: VideoAspect = params.aspect ?? config.defaultAspect;
  if (!ALLOWED_ASPECTS.has(aspect)) {
    throw new MoneyPrinterError(400, "invalid_aspect", "Le format d'aspect doit être 9:16, 16:9 ou 1:1.");
  }

  const videoCount = Math.max(1, Math.min(params.videoCount ?? 1, 5));
  const voiceName = params.voiceName?.trim() || config.defaultVoice;
  const subtitleEnabled = params.subtitleEnabled ?? true;
  const script = params.script?.trim() || undefined;

  return {
    subject,
    aspect,
    videoCount,
    voiceName,
    subtitleEnabled,
    script,
  };
}

/**
 * Valide l'identifiant de tâche pour éviter toute injection de chemin ou requête malveillante.
 */
export function sanitizeTaskId(taskId: string): string {
  const clean = taskId?.trim();
  if (!clean || !TASK_ID_REGEX.test(clean)) {
    throw new MoneyPrinterError(400, "invalid_task_id", "Identifiant de tâche invalide.");
  }
  return clean;
}

function buildHeaders(config: MoneyPrinterConfig): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (config.apiKey) {
    headers["x-api-key"] = config.apiKey;
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }
  return headers;
}

/**
 * Déclenche une tâche de génération vidéo sur MoneyPrinterTurbo.
 */
export async function createVideoTask(
  params: GenerateVideoParams,
  overrideConfig?: MoneyPrinterConfig
): Promise<VideoTaskResponse> {
  const config = overrideConfig ?? getMoneyPrinterConfig();
  if (!config) {
    throw new MoneyPrinterError(
      503,
      "service_unavailable",
      "Le service de génération vidéo MoneyPrinterTurbo n'est pas configuré."
    );
  }

  const clean = sanitizeVideoParams(params, config);

  const payload: Record<string, unknown> = {
    video_subject: clean.subject,
    video_aspect: clean.aspect,
    voice_name: clean.voiceName,
    subtitle_enabled: clean.subtitleEnabled,
    video_count: clean.videoCount,
  };

  if (clean.script) {
    payload.video_script = clean.script;
  }

  const endpoint = `${config.apiUrl}/api/v1/videos`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: buildHeaders(config),
      body: JSON.stringify(payload),
      ...withTimeout(undefined, config.timeoutMs),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      let message = "Erreur lors de la création de la vidéo.";
      try {
        const parsed = JSON.parse(errText);
        message = parsed.message || parsed.error || message;
      } catch {}
      throw new MoneyPrinterError(res.status >= 500 ? 502 : res.status, "upstream_error", message);
    }

    const data = (await res.json()) as { task_id?: string; taskId?: string; status?: string };
    const taskId = data.task_id || data.taskId;

    if (!taskId) {
      throw new MoneyPrinterError(502, "invalid_response", "Réponse incomplète du service vidéo (task_id manquant).");
    }

    return {
      taskId,
      status: (data.status as TaskStatus) || "processing",
    };
  } catch (e) {
    if (e instanceof MoneyPrinterError) throw e;
    const msg = e instanceof Error ? e.message : "Connexion impossible au service vidéo";
    throw new MoneyPrinterError(503, "connection_failed", `Impossible de joindre MoneyPrinterTurbo : ${msg}`);
  }
}

/**
 * Récupère l'état et l'avancement d'une tâche vidéo.
 */
export async function getVideoTaskStatus(
  taskId: string,
  overrideConfig?: MoneyPrinterConfig
): Promise<VideoTaskStatus> {
  const config = overrideConfig ?? getMoneyPrinterConfig();
  if (!config) {
    throw new MoneyPrinterError(
      503,
      "service_unavailable",
      "Le service de génération vidéo MoneyPrinterTurbo n'est pas configuré."
    );
  }

  const cleanId = sanitizeTaskId(taskId);
  const endpoint = `${config.apiUrl}/api/v1/tasks/${encodeURIComponent(cleanId)}`;

  try {
    const res = await fetch(endpoint, {
      method: "GET",
      headers: buildHeaders(config),
      ...withTimeout(undefined, config.timeoutMs),
    });

    if (res.status === 404) {
      throw new MoneyPrinterError(404, "task_not_found", "Tâche vidéo introuvable.");
    }

    if (!res.ok) {
      throw new MoneyPrinterError(res.status >= 500 ? 502 : res.status, "upstream_error", "Erreur lors de la vérification de la tâche.");
    }

    const data = (await res.json()) as {
      status?: string;
      progress?: number;
      result?: { video_url?: string; file_path?: string };
      video_url?: string;
      error?: string;
    };

    let resolvedUrl: string | null = null;
    const rawUrl = data.result?.video_url || data.video_url || data.result?.file_path;
    if (rawUrl) {
      if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
        resolvedUrl = rawUrl;
      } else {
        resolvedUrl = `${config.apiUrl}${rawUrl.startsWith("/") ? "" : "/"}${rawUrl}`;
      }
    }

    let status: TaskStatus = "processing";
    const rawStatus = (data.status || "").toLowerCase();
    if (rawStatus === "completed" || rawStatus === "success" || rawStatus === "done") {
      status = "completed";
    } else if (rawStatus === "failed" || rawStatus === "error") {
      status = "failed";
    } else if (rawStatus === "pending" || rawStatus === "queued") {
      status = "pending";
    }

    return {
      taskId: cleanId,
      status,
      progress: Math.min(100, Math.max(0, data.progress ?? (status === "completed" ? 100 : 0))),
      videoUrl: resolvedUrl,
      error: data.error || null,
    };
  } catch (e) {
    if (e instanceof MoneyPrinterError) throw e;
    const msg = e instanceof Error ? e.message : "Connexion impossible au service vidéo";
    throw new MoneyPrinterError(503, "connection_failed", `Impossible de joindre MoneyPrinterTurbo : ${msg}`);
  }
}

/**
 * Génère uniquement le script de la vidéo (sans lancer le montage).
 */
export async function generateVideoScript(
  params: GenerateScriptParams,
  overrideConfig?: MoneyPrinterConfig
): Promise<{ script: string }> {
  const config = overrideConfig ?? getMoneyPrinterConfig();
  if (!config) {
    throw new MoneyPrinterError(
      503,
      "service_unavailable",
      "Le service de génération vidéo MoneyPrinterTurbo n'est pas configuré."
    );
  }

  const subject = params.subject?.trim();
  if (!subject) {
    throw new MoneyPrinterError(400, "invalid_subject", "Le sujet est obligatoire pour générer le script.");
  }

  const endpoint = `${config.apiUrl}/api/v1/scripts`;
  const payload: Record<string, unknown> = {
    video_subject: subject,
  };
  if (params.customSystemPrompt) payload.custom_system_prompt = params.customSystemPrompt;
  if (params.customScriptPrompt) payload.video_script_prompt = params.customScriptPrompt;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: buildHeaders(config),
      body: JSON.stringify(payload),
      ...withTimeout(undefined, config.timeoutMs),
    });

    if (!res.ok) {
      throw new MoneyPrinterError(res.status >= 500 ? 502 : res.status, "upstream_error", "Erreur lors de la génération du script.");
    }

    const data = (await res.json()) as { video_script?: string; script?: string };
    const script = data.video_script || data.script;
    if (!script) {
      throw new MoneyPrinterError(502, "invalid_response", "Réponse incomplète du service (script manquant).");
    }

    return { script };
  } catch (e) {
    if (e instanceof MoneyPrinterError) throw e;
    const msg = e instanceof Error ? e.message : "Connexion impossible au service vidéo";
    throw new MoneyPrinterError(503, "connection_failed", `Impossible de joindre MoneyPrinterTurbo : ${msg}`);
  }
}
