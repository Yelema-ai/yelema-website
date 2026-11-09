import { backoffice } from "@/lib/backoffice";
import { ApiError, readJson } from "@/lib/http";
import { pickCreate, triggerRefusalMessage } from "@/lib/triggers";
import { noStore, settingsError, settingsToken } from "../llm/_shared";

// `GET|POST /api/triggers` — les déclencheurs « quand… alors… » de sa propre instance (back-office `/app/triggers`).
const NOT_YET = "Les déclencheurs arrivent avec la prochaine mise à jour de votre espace.";

export async function GET() {
  try {
    return noStore(await backoffice.triggers(await settingsToken()));
  } catch (e) {
    return settingsError(e, (code) => (code === "not_found" ? NOT_YET : triggerRefusalMessage(code)));
  }
}

export async function POST(request: Request) {
  try {
    const body = pickCreate(await readJson(request));
    if (!body) throw new ApiError(400, "bad_request", "Choisissez un expert et un événement, puis écrivez la consigne.");
    return noStore(await backoffice.createTrigger(await settingsToken(), body));
  } catch (e) {
    return settingsError(e, triggerRefusalMessage);
  }
}
