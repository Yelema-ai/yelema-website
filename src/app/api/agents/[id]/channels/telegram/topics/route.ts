import { EXPERT_KEYS } from "@/config/experts";
import { agent37, instanceFetch } from "@/lib/agent37";
import { requireAgentAccess } from "@/lib/auth";
import { repointRoutines } from "@/lib/hermes-cron";
import { handleError, json } from "@/lib/http";
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

// "Créer les sujets des experts": one forum topic per expert profile in the group the user ran
// /sethome in, each routed to its expert, then a restart of the default profile's gateway. Idempotent,
// so the button can be pressed again after hiring an expert. The commands are constants: nothing from
// the request reaches the shell. Answers { ok, message, output } (see TelegramTopicsResult).
export async function POST(_request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    await requireAgentAccess(id, "admin");

    // Server-side write outside the drive on purpose: the script goes where the command runs it.
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
    // Routines that posted only in the app now post to their expert's topic too. Best effort: the
    // topics exist either way, and turning a routine on points it at them again.
    await repointRoutines(id, EXPERT_KEYS).catch((e) => console.error(`[telegram/topics] routines not repointed on ${id}`, e));
    return json<TelegramTopicsResult>({ ok: true, message: TOPICS_CREATED, output: fullOutput });
  } catch (e) {
    return handleError(e);
  }
}
