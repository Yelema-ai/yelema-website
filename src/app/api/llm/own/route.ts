import { backoffice } from "@/lib/backoffice";
import { keyDraft, noStore, settingsError, settingsToken } from "../_shared";

// `PUT|DELETE /api/llm/own` — the signed-in user's own model key, any provider, no admin needed. The
// back office checks the key with its provider, keeps it and installs it; the app passes it on and
// writes nothing on an instance.
export async function PUT(request: Request) {
  try {
    return noStore(await backoffice.setLlmKey(await settingsToken(), { kind: "own" }, await keyDraft(request)));
  } catch (e) {
    return settingsError(e);
  }
}

export async function DELETE() {
  try {
    return noStore(await backoffice.removeLlmKey(await settingsToken(), { kind: "own" }));
  } catch (e) {
    return settingsError(e);
  }
}
