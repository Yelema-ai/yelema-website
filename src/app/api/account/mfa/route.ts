import { backoffice } from "@/lib/backoffice";
import { handleError, noStore, readJson } from "@/lib/http";
import { token } from "../_shared";

// `GET|POST /api/account/mfa` — the member's own second factors (no secret), and the start of a new one:
// the back office answers its QR code and key once, nothing is active before `verify`.
export async function GET() {
  try {
    return noStore(await backoffice.mfaFactors(await token()));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request) {
  try {
    const t = await token();
    const { name } = await readJson<{ name?: unknown }>(request);
    const label = typeof name === "string" ? name.trim().slice(0, 40) : "";
    return noStore(await backoffice.mfaEnroll(t, label || undefined));
  } catch (e) {
    return handleError(e);
  }
}
