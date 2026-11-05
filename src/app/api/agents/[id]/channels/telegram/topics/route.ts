import { boostTelegramGroup } from "@/lib/telegram-boost";
import { applyTelegramTopicIcons } from "@/lib/telegram-topic-icons-sync";
import { agent37, instanceFetch } from "@/lib/agent37";
import { requireAgentAccess } from "@/lib/auth";
import { repointRoutines } from "@/lib/hermes-cron";
import { handleError, json } from "@/lib/http";
import { installedProfiles } from "@/lib/installed-experts";
import type { TelegramTopicsResult } from "@/lib/channels";
import {
  ADD_PROFILE_ROUTE_PY,
  GATEWAY_RESTART_COMMAND,
  RESTART_FAILED,
  ROUTE_PROFILES_COMMAND,
  ROUTE_SCRIPT_FILE,
  TOPICS_CREATED,
  outputTail,
  routingFailure,
  routingSkipped,
} from "@/lib/telegram-topics";
import { assertUpstreamOk } from "../../../_helpers";

// One Telegram API call per expert, then a gateway restart: up to a minute or two.
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

// "Créer les sujets des experts": one forum topic per expert profile of THIS instance in the group
// the member ran /sethome in, each routed to its expert, then a restart of the default profile's
// gateway. Idempotent, so the button can be pressed again after an expert is added. The commands are constants: nothing from
// the request reaches the shell. Answers { ok, message, output } (see TelegramTopicsResult).
export async function POST(_request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { row } = await requireAgentAccess(id);

    // Lecture du home_channel configuré pour ce groupe Telegram
    let targetChatId: string | undefined;
    try {
      const checkHome = await agent37.exec(id, "hermes -p default config get platforms.telegram.home_channel.chat_id --raw 2>/dev/null || true");
      targetChatId = checkHome.stdout?.trim();
      if (targetChatId && /^-?\d+$/.test(targetChatId)) {
        boostTelegramGroup(targetChatId).then((res) => {
          if (res.ok) console.log(`[telegram/boost] Groupe ${targetChatId} boosté automatiquement:`, res);
          else if (res.error !== "not_configured") console.warn(`[telegram/boost] Échec du boost automatique:`, res.message || res.error);
        }).catch((e) => console.warn(`[telegram/boost] Erreur boost:`, e));
      }
    } catch {}

    const query = new URLSearchParams({ path: ROUTE_SCRIPT_FILE, overwrite: "true" });
    const upload = await instanceFetch(id, `/v1/files/content?${query.toString()}`, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: ADD_PROFILE_ROUTE_PY,
    });
    await assertUpstreamOk(upload, "telegram/topics", "L’ordinateur de vos experts ne répond pas. Réessayez.", "upload_error");
    await upload.body?.cancel().catch(() => undefined);

    const routed = await agent37.exec(id, ROUTE_PROFILES_COMMAND);
    const output = outputTail(routed.stdout, routed.stderr);

    const skipped = routingSkipped(routed.stdout);
    if (skipped) return json<TelegramTopicsResult>({ ok: false, message: skipped, output });

    const restart = await agent37.exec(id, GATEWAY_RESTART_COMMAND);
    const fullOutput = [output, `gateway restart: ${restart.exit_code === 0 ? "ok" : `échec (${restart.exit_code})`}`]
      .filter(Boolean)
      .join("\n");

    if (routed.exit_code !== 0) {
      console.error(`[telegram/topics] routing failed on ${id}`, output);
      return json<TelegramTopicsResult>({ ok: false, message: routingFailure(output), output: fullOutput });
    }
    if (restart.exit_code !== 0) {
      console.error(`[telegram/topics] gateway restart failed on ${id}`, outputTail(restart.stdout, restart.stderr));
      return json<TelegramTopicsResult>({ ok: false, message: RESTART_FAILED, output: fullOutput });
    }

    // Si le compte Premium Mstudio est présent dans le groupe, applique automatiquement les 12 visages officiels
    // puis quitte le groupe pour ne pas encombrer le groupe client (les icônes restent permanentes).
    if (targetChatId && /^-?\d+$/.test(targetChatId)) {
      applyTelegramTopicIcons(targetChatId, { leaveAfter: true }).then((res) => {
        if (res.ok) console.log(`[telegram/icons] Visages officiels appliqués sur ${targetChatId}:`, res.applied);
        else if (res.error !== "not_configured") console.log(`[telegram/icons] Application directe ignorée (${targetChatId}):`, res.message || res.error);
      }).catch((e) => console.warn(`[telegram/icons] Erreur application visages:`, e));
    }

    // Routines that posted only in the app now post to their expert's topic too. Best effort: the
    // topics exist either way, and turning a routine on points it at them again.
    const { profiles } = await installedProfiles([row]);
    await repointRoutines(
      id,
      profiles.map((p) => p.profileId)
    ).catch((e) => console.error(`[telegram/topics] routines not repointed on ${id}`, e));
    return json<TelegramTopicsResult>({ ok: true, message: TOPICS_CREATED, output: fullOutput });
  } catch (e) {
    return handleError(e);
  }
}
