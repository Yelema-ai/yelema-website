import "server-only";
import { spawn } from "node:child_process";
import { join } from "node:path";

export interface TelegramTopicIconStatus {
  profile: string;
  topic_id: number;
  status?: "already_set" | "updated" | "not_modified";
  error?: string;
}

export interface TelegramApplyIconsResult {
  ok: boolean;
  chat_id?: string;
  applied?: TelegramTopicIconStatus[];
  errors?: (TelegramTopicIconStatus | { action?: string; error: string })[];
  left_group?: boolean;
  message?: string;
  error?: string;
}

/**
 * Applique automatiquement les 12 visages officiels ExpertYelema sur les sujets Telegram
 * via le compte Telegram Premium Mstudio configuré (MTProto).
 *
 * @param chatId L'identifiant numérique ou chaîne du supergroupe Telegram (-100...).
 * @param options.leaveAfter Si true, le compte Mstudio quitte automatiquement le groupe après avoir appliqué les visages (les icônes restent permanentes).
 */
export async function applyTelegramTopicIcons(
  chatId: string | number,
  options?: { leaveAfter?: boolean }
): Promise<TelegramApplyIconsResult> {
  const apiId = process.env.TELEGRAM_API_ID?.trim();
  const apiHash = process.env.TELEGRAM_API_HASH?.trim();
  const sessionStr = process.env.TELEGRAM_SESSION_STRING?.trim();

  if (!apiId || !apiHash || !sessionStr) {
    return {
      ok: false,
      error: "not_configured",
      message: "TELEGRAM_API_ID, TELEGRAM_API_HASH ou TELEGRAM_SESSION_STRING non configurés dans l'environnement.",
    };
  }

  const scriptPath = join(process.cwd(), "scripts", "apply_telegram_topic_icons.py");
  const cleanChatId = String(chatId).trim();
  const args = [scriptPath, cleanChatId];
  if (options?.leaveAfter) {
    args.push("--leave");
  }

  return new Promise((resolve) => {
    const child = spawn("python3", args, {
      env: {
        ...process.env,
        TELEGRAM_API_ID: apiId,
        TELEGRAM_API_HASH: apiHash,
        TELEGRAM_SESSION_STRING: sessionStr,
      },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      if (stdout.trim()) {
        try {
          const parsed = JSON.parse(stdout.trim()) as TelegramApplyIconsResult;
          return resolve(parsed);
        } catch {}
      }
      if (code !== 0) {
        return resolve({
          ok: false,
          error: "process_failed",
          message: stderr.trim() || stdout.trim() || `Échec de l'application des icônes avec le code ${code}`,
        });
      }
      resolve({ ok: true, message: stdout.trim() });
    });

    child.on("error", (err) => {
      resolve({
        ok: false,
        error: "spawn_error",
        message: err.message,
      });
    });
  });
}
