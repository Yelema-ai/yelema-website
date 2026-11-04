import { backoffice } from "@/lib/backoffice";
import { PUBKEY_RE } from "@/lib/buzz";
import { handleError, json, readJson } from "@/lib/http";
import { mailToken as sessionToken, noStore } from "../../mail/_session";

// `POST /api/buzz/salons` — opens a named salon with these keys; the back office creates it on the relay.
export async function POST(request: Request) {
  try {
    const { nom, cles } = await readJson<{ nom?: unknown; cles?: unknown }>(request);
    const keys = Array.isArray(cles) ? cles.filter((k): k is string => typeof k === "string" && PUBKEY_RE.test(k)).slice(0, 50) : [];
    return noStore(json(await backoffice.buzzSalon(await sessionToken(), { nom: typeof nom === "string" ? nom.slice(0, 60) : "", cles: keys })));
  } catch (e) {
    return handleError(e);
  }
}
