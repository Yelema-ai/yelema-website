import { agent37 } from "@/lib/agent37";
import { requireAgentAccess } from "@/lib/auth";
import { loadCatalogueExpert } from "@/lib/catalogue";
import { FIRST_SCREEN_BUDGET_MS, within } from "@/lib/first-screen";
import { handleError, json } from "@/lib/http";
import { readJourZero } from "@/lib/jour-zero-server";
import { isProfileId } from "@/lib/profile-id";
import { DEFAULT_PROFILE, profileQuery, resolveProfile } from "@/lib/profiles";

type Ctx = { params: Promise<{ id: string }> };

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
      asked.get("models") === "0" ? null : within(agent37.listModels(id, profileQuery(profile)), FIRST_SCREEN_BUDGET_MS),
      profile === DEFAULT_PROFILE || asked.get("jz") === "0" ? null : within(readJourZero(id, profile, refused), FIRST_SCREEN_BUDGET_MS),
      fiche && isProfileId(fiche) ? within(loadCatalogueExpert(fiche), FIRST_SCREEN_BUDGET_MS) : null,
    ]);
    return json({ models, jourZero, fiche: expert });
  } catch (e) {
    return handleError(e);
  }
}
