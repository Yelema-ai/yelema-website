// The routes an instance calls with its own token (tool proxy, memory, supervision, speech): how often one token
// may call, per server instance and before any lookup; and a body read up to a bound. Pure: tested.
import { createHash } from "node:crypto";
import { rateWindow } from "./guest-access.ts";

/** Seconds to wait when `token` called more than `perMinute` times this minute; null otherwise. */
export function tokenLimit(perMinute: number) {
  const hit = rateWindow(perMinute, 60_000, 20_000);
  return (token: string, nowMs = Date.now()): number | null => {
    const r = hit(createHash("sha256").update(token).digest("base64url"), nowMs);
    return r.ok ? null : r.retryAfter;
  };
}

/** The body's bytes; null when it is larger than `maxBytes`, announced or read. */
export async function boundedBytes(message: Pick<Request, "headers" | "body">, maxBytes: number): Promise<Uint8Array<ArrayBuffer> | null> {
  const declared = Number(message.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await message.body?.cancel().catch(() => undefined);
    return null;
  }
  if (!message.body) return new Uint8Array(0);
  const reader = message.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}
