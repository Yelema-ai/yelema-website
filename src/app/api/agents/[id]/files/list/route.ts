import { agent37, Agent37Error } from "@/lib/agent37";
import { requireAgentAccess } from "@/lib/auth";
import { assertInDrive, isDriveRoot } from "@/lib/drive";
import { handleError, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// List one directory level of the drive for the Files tab. `path` is optional: omitting it lists
// the drive's root (~/Livrables), and anything outside the drive is refused. The Agents API returns
// the resolved absolute `path` + `parentPath`, so the browser navigates off the response alone; at
// the drive's root `parentPath` is cleared, so "up" stops there. Upstream typed errors (e.g.
// not_a_directory) keep their code/status.
export async function GET(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    await requireAgentAccess(id);

    const path = assertInDrive(new URL(request.url).searchParams.get("path"));
    const atRoot = isDriveRoot(path);

    let listing;
    try {
      listing = await agent37.listFiles(id, path);
    } catch (e) {
      // An instance the back office has not prepared yet has no drive: create it on first open.
      if (!(atRoot && e instanceof Agent37Error && e.status === 404)) throw e;
      await agent37.makeDir(id, path);
      listing = await agent37.listFiles(id, path);
    }

    return json(atRoot || isDriveRoot(listing.path) ? { ...listing, parentPath: null } : listing);
  } catch (e) {
    return handleError(e);
  }
}
