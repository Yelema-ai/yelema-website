import { backoffice } from "@/lib/backoffice";
import { PUBKEY_RE } from "@/lib/buzz";
import { handleError, json, readJson } from "@/lib/http";
import { mailToken as sessionToken, noStore } from "../../mail/_session";

// `POST /api/buzz/sent` — tells the back office that the member wrote to these keys (never the text),
// so the people concerned are notified.
export async function POST(request: Request) {
  try {
    const { kind, recipients } = await readJson<{ kind?: string; recipients?: unknown }>(request);
    const keys = Array.isArray(recipients) ? recipients.filter((r): r is string => typeof r === "string" && PUBKEY_RE.test(r)).slice(0, 50) : [];
    return noStore(json(await backoffice.buzzSent(await sessionToken(), { kind: kind === "reply" || kind === "salon" ? kind : "dm", recipients: keys })));
  } catch (e) {
    return handleError(e);
  }
}
