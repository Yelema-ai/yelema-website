import { requireMember, requireUser } from "@/lib/auth";
import { loadCatalogue, matchCatalogue } from "@/lib/catalogue";
import { ApiError, handleError, json } from "@/lib/http";
import { installedProfiles, visibleAgents } from "@/lib/installed-experts";
import type { CatalogueResponse, InstalledExpert } from "@/lib/types";

// `GET /api/catalogue?workspace={id}` — every expert Yelema offers, with where each one is
// installed for this user. The gallery reads it: an installed expert opens its chat, the others
// are shown as not yet in the team (adding one is a back-office action, not this app's).
export async function GET(request: Request) {
  try {
    const { db, user } = await requireUser();
    const workspaceId = new URL(request.url).searchParams.get("workspace");
    if (!workspaceId) throw new ApiError(400, "invalid_request", "Demande incomplète.");

    await requireMember(db, workspaceId, user.id);
    const agents = await visibleAgents(db, workspaceId, user.id);
    const [{ profiles }, catalogue] = await Promise.all([installedProfiles(agents), loadCatalogue()]);

    const installed = new Map<string, InstalledExpert[]>();
    for (const p of profiles) {
      const entry = matchCatalogue(catalogue.experts, p.profileId);
      if (!entry) continue;
      const list = installed.get(entry.key) ?? [];
      list.push({ agentId: p.agent.agent37_id, agentName: p.agent.name, profileId: p.profileId });
      installed.set(entry.key, list);
    }

    return json<CatalogueResponse>({
      available: catalogue.available,
      defaultExpertKey: catalogue.defaultExpertKey,
      categories: catalogue.categories,
      experts: catalogue.experts.map((e) => ({ ...e, installed: installed.get(e.key) ?? [] })),
    });
  } catch (e) {
    return handleError(e);
  }
}
