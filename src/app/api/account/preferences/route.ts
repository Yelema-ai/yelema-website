import { backoffice, type MemberPrefs, type MemberPrefsPatch } from "@/lib/backoffice";
import { apiError, handleError, json, readJson } from "@/lib/http";
import { parseTourUpdate } from "@/lib/tour-state";
import { noStore } from "../../mail/_session";
import { token } from "../_shared";

// `GET|PUT /api/account/preferences` — pinned/archived conversations, notification kinds and the guided tour,
// kept by the back office so they follow the member across devices. It checks the shape.
export async function GET() {
  try {
    return noStore(json(await backoffice.preferences(await token())));
  } catch (e) {
    return handleError(e);
  }
}

export async function PUT(request: Request) {
  try {
    const t = await token();
    const body = await readJson(request);
    const patch: MemberPrefsPatch = {};
    if (body.chatMarks !== undefined) patch.chatMarks = body.chatMarks as MemberPrefs["chatMarks"];
    if (body.notify !== undefined) patch.notify = body.notify as MemberPrefs["notify"];
    if (body.tour !== undefined) {
      const tour = parseTourUpdate(body.tour);
      if (!tour) return apiError("Visite guidée : { done: true } ou { done: false } attendu.", 400, "invalid_request");
      patch.tour = tour;
    }
    return noStore(json(await backoffice.setPreferences(t, patch)));
  } catch (e) {
    return handleError(e);
  }
}
