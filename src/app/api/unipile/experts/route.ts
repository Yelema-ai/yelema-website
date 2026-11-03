import { backoffice } from "@/lib/backoffice";
import { ApiError, readJson } from "@/lib/http";
import { parseUnipileExperts } from "@/lib/unipile";
import { noStore, settingsToken, unipileError } from "../_shared";

// `PUT /api/unipile/experts` — change only which Experts reach the messaging; the key stays on the instance.
export async function PUT(request: Request) {
  try {
    const experts = parseUnipileExperts(await readJson(request));
    if (!experts) throw new ApiError(400, "bad_request", "Choisissez au moins un Expert.");
    return noStore(await backoffice.setUnipileExperts(await settingsToken(), experts));
  } catch (e) {
    return unipileError(e);
  }
}
