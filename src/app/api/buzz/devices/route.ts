import { backoffice } from "@/lib/backoffice";
import { PUBKEY_RE } from "@/lib/buzz";
import { handleError, json, readJson } from "@/lib/http";
import { mailToken as sessionToken, noStore } from "../../mail/_session";

// `POST /api/buzz/devices` — admits this browser's public key on the client's relay (the private key
// never leaves the browser). `DELETE` — removes one.
export async function POST(request: Request) {
  try {
    const { pubkey, label } = await readJson<{ pubkey?: string; label?: string }>(request);
    if (!pubkey || !PUBKEY_RE.test(pubkey)) return json({ error: "Clé publique invalide." }, 422);
    return noStore(json(await backoffice.buzzAddDevice(await sessionToken(), { pubkey, label: (label ?? "Navigateur").slice(0, 60) })));
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(request: Request) {
  try {
    const { pubkey } = await readJson<{ pubkey?: string }>(request);
    if (!pubkey || !PUBKEY_RE.test(pubkey)) return json({ error: "Clé publique invalide." }, 422);
    return noStore(json(await backoffice.buzzRemoveDevice(await sessionToken(), pubkey)));
  } catch (e) {
    return handleError(e);
  }
}
