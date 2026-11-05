import { backoffice } from "@/lib/backoffice";
import { PUBKEY_RE } from "@/lib/buzz";
import { handleError, json, readJson } from "@/lib/http";
import { mailToken as sessionToken, noStore } from "../../mail/_session";

// `POST /api/buzz/sent` — tells the back office that the member wrote to these keys (never the text),
// so the people concerned are notified; `ajout`: they were just added to a salon (its id and name go along).
export async function POST(request: Request) {
  try {
    const { kind, recipients, salon, nom } = await readJson<{ kind?: string; recipients?: unknown; salon?: unknown; nom?: unknown }>(request);
    const keys = Array.isArray(recipients) ? recipients.filter((r): r is string => typeof r === "string" && PUBKEY_RE.test(r)).slice(0, 50) : [];
    if (kind === "ajout") {
      const id = typeof salon === "string" && /^[0-9a-f-]{36}$/.test(salon) ? salon : null;
      const name = typeof nom === "string" ? nom.trim().slice(0, 60) : "";
      if (!id) return noStore(json({ ok: true as const }));
      return noStore(json(await backoffice.buzzSent(await sessionToken(), { kind, recipients: keys, salon: id, nom: name })));
    }
    return noStore(json(await backoffice.buzzSent(await sessionToken(), { kind: kind === "reply" || kind === "salon" ? kind : "dm", recipients: keys })));
  } catch (e) {
    return handleError(e);
  }
}
