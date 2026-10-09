import { agent37 } from "@/lib/agent37";
import { requireAgentAccess } from "@/lib/auth";
import { assertInDrive, isDriveRoot } from "@/lib/drive";
import { ApiError, handleError, json, readJson } from "@/lib/http";
import { requireTrimmed } from "../_helpers";

type Ctx = { params: Promise<{ id: string }> };

// Recursive force delete (rm -rf) of one path inside the drive. The Agents API applies no guards of
// its own, so the path is checked here and confirmation lives in the UI. A symlink is removed
// itself, not followed.
export async function DELETE(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    await requireAgentAccess(id);

    const path = assertInDrive(requireTrimmed(new URL(request.url).searchParams.get("path"), "Demande incomplète."));
    if (isDriveRoot(path)) throw new ApiError(400, "invalid_path", "Le dossier racine ne peut pas être supprimé");
    return json(await agent37.deleteFile(id, path));
  } catch (e) {
    return handleError(e);
  }
}

// Rename/move a path (fs.rename on the instance; the OS decides overwrite/dir rules). Returns the
// resolved FileEntry of the new path so the browser can reflect the move without a relist.
export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    await requireAgentAccess(id);

    const { from, to } = await readJson<{ from?: string; to?: string }>(request);
    const source = assertInDrive(requireTrimmed(from, "Demande incomplète."));
    if (isDriveRoot(source)) throw new ApiError(400, "invalid_path", "Le dossier racine ne peut pas être déplacé");
    return json(await agent37.moveFile(id, source, assertInDrive(requireTrimmed(to, "Demande incomplète."))));
  } catch (e) {
    return handleError(e);
  }
}
