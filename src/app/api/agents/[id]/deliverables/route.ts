import { deliverablesFromTree } from "@/lib/deliverables-shape";
import { instanceDriveTree } from "@/lib/drive-tree-server";
import { fileLinkKey, fileLinkQuery } from "@/lib/file-link";
import { ApiError, handleError, noStore } from "@/lib/http";
import { authViaBackoffice, multiTenant, siteUrl } from "@/lib/runtime-config";
import { currentInstance } from "@/lib/session";
import { requestSiteOrigin } from "@/lib/site-url";
import { pinnedWorkspaceId } from "@/lib/tenant";
import { hostOf } from "@/lib/tenant-resolver";

type Ctx = { params: Promise<{ id: string }> };

// The mobile app's deliverables, same JSON as the back office's `GET /api/v1/app/deliverables` minus the
// preview pages (rendered there), read from the drive tree the gateway keeps. Contract:
// docs/plans/mobile-par-la-passerelle.md. 404 where it cannot answer: the app then asks the back office.
export async function GET(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const key = fileLinkKey();
    if (!authViaBackoffice() || !key) throw new ApiError(404, "not_found", "Not found");
    const [tree, instance, workspace] = await Promise.all([instanceDriveTree(id), currentInstance(), pinnedWorkspaceId()]);
    // A folder that failed to list would read as deliverables gone, then announced again as new.
    if (!tree.complete || !instance) throw new ApiError(503, "deliverables_unavailable", "Les livrables sont momentanément indisponibles.");
    const base = `${requestSiteOrigin(multiTenant(), siteUrl(), hostOf(request.headers), new URL(request.url).origin)}/api/agents/${encodeURIComponent(id)}/files/signed?`;
    const items = deliverablesFromTree(tree, {
      profiles: instance.seat ? [] : instance.experts.map((e) => e.profile),
      only: instance.seat ?? null,
      link: (path) => base + fileLinkQuery(key, workspace ?? "", id, path),
    });
    return noStore({ items });
  } catch (e) {
    return handleError(e);
  }
}
