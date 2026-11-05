import { backoffice } from "@/lib/backoffice";
import { withOwnPhoto, withPhotos } from "@/lib/buzz";
import { loadCatalogue, matchCatalogue } from "@/lib/catalogue";
import { handleError, json } from "@/lib/http";
import { mailToken as sessionToken, noStore } from "../mail/_session";

// `GET /api/buzz` — the members' messaging: relay address, the member's devices, directory, salons.
// Relayed with the member's own session; the back office decides who is listed. Experts get their
// catalogue portrait here (the catalogue never fails: without it, initials); people get theirs when the back
// office serves it, and the member their own profile photo in any case (`/app/me`, never in the way).
export async function GET() {
  try {
    const token = await sessionToken();
    const [overview, catalogue, me] = await Promise.all([backoffice.buzz(token), loadCatalogue(), backoffice.me(token).catch(() => null)]);
    const experts = withPhotos(overview.annuaire, (profil) => matchCatalogue(catalogue.experts, profil)?.avatarUrl ?? null);
    const annuaire = withOwnPhoto(experts, overview.appareils.map((d) => d.cle), me?.user.avatarUrl);
    return noStore(json({ ...overview, annuaire }));
  } catch (e) {
    return handleError(e);
  }
}
