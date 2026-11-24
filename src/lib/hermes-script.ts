// The shell script of one call to the instance's own messaging API (lib/hermes-messaging.ts runs it). Pure: tested.
const DASHBOARD_ORIGIN = "http://127.0.0.1:9119";
export const OUTPUT_MARKER = "A37_HERMES_JSON:";

function quote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

// `bodyFile`: the request's JSON, already on the instance; read from there and removed, so no credential rides the command.
export function script(method: string, path: string, body?: unknown, bodyFile?: string): string {
  const payload = body === undefined ? "" : ` -H 'content-type: application/json' ${bodyFile ? `--data-binary @"${bodyFile}"` : `-d ${quote(JSON.stringify(body))}`}`;
  return [
    ...(bodyFile ? [`trap 'rm -f "${bodyFile}"' EXIT`, `chmod 600 "${bodyFile}"`] : []),
    `token=$(curl -sS --max-time 10 ${DASHBOARD_ORIGIN}/ | grep -o '__HERMES_SESSION_TOKEN__="[^"]*"' | head -1 | cut -d'"' -f2)`,
    // No marker printed: an unreachable dashboard has to read as "try again", never as a bad answer.
    `[ -n "$token" ] || { echo 'no hermes session token' >&2; exit 1; }`,
    `printf '%s' '${OUTPUT_MARKER}'`,
    `curl -sS --max-time 90 -X ${quote(method)} -H "X-Hermes-Session-Token: $token"${payload} ${quote(`${DASHBOARD_ORIGIN}${path}`)}`,
  ].join("\n");
}
