import { backoffice } from "@/lib/backoffice";
import { handleError, json } from "@/lib/http";
import { mailToken as sessionToken, noStore } from "../mail/_session";

// `GET /api/buzz` — the members' messaging: relay address, the member's devices, directory, salons.
// Relayed with the member's own session; the back office decides who is listed.
export async function GET() {
  try {
    return noStore(json(await backoffice.buzz(await sessionToken())));
  } catch (e) {
    return handleError(e);
  }
}
