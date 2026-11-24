import { boundedBytes, tokenLimit } from "@/lib/instance-limits";
import { backoffice, BackofficeError } from "@/lib/backoffice";
import { authViaBackoffice } from "@/lib/runtime-config";
import { pinnedWorkspaceId } from "@/lib/tenant";
import { TenantError } from "@/lib/tenant-resolver";

// OpenAI-shaped speech-to-text for the instances' Hermes (`stt.provider: openai`, base_url
// `<app>/api/stt/v1`, same Bearer token as `apps`): their Telegram voice notes are transcribed by the
// back office's speech service, like the chat's dictation. This route holds no key and keeps nothing.
export const maxDuration = 120;

const MAX_BYTES = 8 * 1024 * 1024;
// A voice note at a time: a minute of them is already a lot.
const limit = tokenLimit(60);

/** OpenAI's error shape, which Hermes's SDK reads. */
const fail = (status: number, message: string): Response => Response.json({ error: { message, type: "invalid_request_error" } }, { status });

export async function POST(request: Request): Promise<Response> {
  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1]?.trim();
  if (!token) return fail(401, "missing bearer token");
  const wait = limit(token);
  if (wait !== null) return new Response(JSON.stringify({ error: { message: "too many requests", type: "rate_limit_error" } }), { status: 429, headers: { "content-type": "application/json", "retry-after": String(wait) } });
  if (!authViaBackoffice()) return fail(404, "not available");
  let workspace: string | undefined;
  try {
    workspace = await pinnedWorkspaceId();
  } catch (e) {
    return e instanceof TenantError && e.status < 500 ? fail(401, "invalid token") : fail(503, "token lookup unavailable");
  }
  if (!workspace) return fail(404, "not available");

  // Read up to the bound whatever the announced length, then parsed.
  const bytes = await boundedBytes(request, MAX_BYTES + 64 * 1024);
  if (bytes === null) return fail(413, "audio too long (about 4 minutes at most)");
  const form = await new Response(bytes, { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof Blob) || file.size === 0) return fail(400, "file is required");
  const out = new FormData();
  out.append("file", file, "note.ogg");
  out.append("language", String(form?.get("language") ?? "").toLowerCase().startsWith("en") ? "en" : "fr");
  try {
    const { text } = await backoffice.voiceNoteTranscribe(token, workspace, out);
    return form?.get("response_format") === "text"
      ? new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } })
      : Response.json({ text }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof BackofficeError && e.status < 500) return fail(e.status, e.message);
    console.warn("[stt] failed:", e instanceof Error ? e.message : e);
    return fail(502, "transcription unavailable");
  }
}
