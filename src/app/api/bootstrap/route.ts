import { tabBootstrap } from "@/lib/bootstrap-server";
import { handleError, noStore } from "@/lib/http";

// The shell's first read when a tab opens (lib/bootstrap-client): preferences, update status, the own
// instance's conversations and routine runs, its drive. A part left out is read by the browser itself.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return noStore(await tabBootstrap());
  } catch (e) {
    return handleError(e);
  }
}
