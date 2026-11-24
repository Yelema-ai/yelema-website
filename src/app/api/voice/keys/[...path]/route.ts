import { backoffice } from "@/lib/backoffice";
import { ApiError, readJson } from "@/lib/http";
import { parseVoiceKeyDraft, parseVoiceKeyRoute, voiceKeyRefusal } from "@/lib/voice-keys";
import { noStore, scopeToken, settingsError } from "../../../llm/_shared";

type Ctx = { params: Promise<{ path: string[] }> };

// `PUT /api/voice/keys/{client|own|members/{id}}` sets a transcription key in that scope;
// `DELETE …/{provider}` removes one. The back office checks the caller's role on the session.
export async function PUT(request: Request, { params }: Ctx) {
  try {
    const route = parseVoiceKeyRoute((await params).path);
    const draft = parseVoiceKeyDraft(await readJson(request));
    if (!route || route.provider) throw new ApiError(404, "not_found", "Cette adresse n’existe pas.");
    if (!draft) throw new ApiError(400, "bad_request", "Cette demande n’a pas pu être traitée.");
    return noStore(await backoffice.putVoiceKey(await scopeToken(route.scope), route.scope, draft));
  } catch (e) {
    return settingsError(e, voiceKeyRefusal);
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const route = parseVoiceKeyRoute((await params).path);
    if (!route?.provider) throw new ApiError(404, "not_found", "Cette clé est introuvable.");
    return noStore(await backoffice.removeVoiceKey(await scopeToken(route.scope), route.scope, route.provider));
  } catch (e) {
    return settingsError(e, voiceKeyRefusal);
  }
}
