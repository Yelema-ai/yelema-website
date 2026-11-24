import { backoffice } from "@/lib/backoffice";
import { handleError, json } from "@/lib/http";
import { token } from "../../_shared";

// Removing a device needs a session opened with a code: otherwise 403 `aal2_required`, which the page turns into « reconnectez-vous ».
export async function DELETE(_request: Request, { params }: { params: Promise<{ factorId: string }> }) {
  try {
    const t = await token();
    const { factorId } = await params;
    return json(await backoffice.mfaRemove(t, factorId));
  } catch (e) {
    return handleError(e);
  }
}
