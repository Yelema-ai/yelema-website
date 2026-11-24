// What a screen's render error becomes in the server logs: one bounded line, no control character. Pure: tested.

/** The sender (lib/report-error) cuts its fields to well under this. */
export const CLIENT_ERROR_MAX_BYTES = 16 * 1024;

// Line breaks would forge log lines; the other controls (ANSI escapes included) would rewrite a terminal.
const field = (v: unknown, n: number): string =>
  String(v ?? "")
    .replace(/[\r\n\u2028\u2029]+/g, " ⏎ ")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .slice(0, n);

/** null for a body that is absent, too large or not a JSON object. */
export function clientErrorLine(body: string | null): string | null {
  if (!body) return null;
  let e: unknown;
  try {
    e = JSON.parse(body);
  } catch {
    return null;
  }
  if (!e || typeof e !== "object" || Array.isArray(e)) return null;
  const r = e as Record<string, unknown>;
  return `[client-error] ${field(r.where, 40)} ${field(r.path, 200)} :: ${field(r.message, 500)} :: ${field(r.stack, 4000)} :: digest=${field(r.digest, 40)}`;
}
