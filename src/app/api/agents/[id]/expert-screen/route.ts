import { agent37 } from "@/lib/agent37";
import { requireAgentAccess } from "@/lib/auth";
import { loadCatalogueExpert } from "@/lib/catalogue";
import { within } from "@/lib/first-screen";
import { handleError, json } from "@/lib/http";
import { readJourZero } from "@/lib/jour-zero-server";
import { DEFAULT_PROFILE, profileQuery, resolveProfile } from "@/lib/profiles";

type Ctx = { params: Promise<{ id: string }> };

// Past this a part is left out (null) and the page reads it by its own route.
const BUDGET_MS = 2_500;
const CATALOGUE_KEY = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const refused = async (): Promise<never> => {
  throw new Error("jour-zero unavailable");
};

// `?profile=&fiche=` (`models=0`, `jz=0`: parts the page already holds): what an expert's page shows first, in one call: its models, its day-zero
// preparation (an expert only) and its catalogue entry. The conversations come from the sessions store.
export async function GET(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const asked = new URL(request.url).searchParams;
    const { row } = await requireAgentAccess(id);
    const profile = await resolveProfile(row, asked.get("profile"));
    const fiche = asked.get("fiche");
    const [models, jourZero, expert] = await Promise.all([
      asked.get("models") === "0" ? null : within(agent37.listModels(id, profileQuery(profile)), BUDGET_MS),
      profile === DEFAULT_PROFILE || asked.get("jz") === "0" ? null : within(readJourZero(id, profile, refused), BUDGET_MS),
      fiche && CATALOGUE_KEY.test(fiche) ? within(loadCatalogueExpert(fiche), BUDGET_MS) : null,
    ]);
    return json({ models, jourZero, fiche: expert });
  } catch (e) {
    return handleError(e);
  }
}
