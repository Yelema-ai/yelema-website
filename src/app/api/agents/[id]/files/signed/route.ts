import { instanceFetch } from "@/lib/agent37";
import { insideLivrables } from "@/lib/deliverables-shape";
import { fileLinkKey, verifyFileLink } from "@/lib/file-link";
import { ApiError, handleError } from "@/lib/http";
import { pinnedWorkspaceId } from "@/lib/tenant";

type Ctx = { params: Promise<{ id: string }> };

// A deliverable by its signed link (lib/file-link.ts), no session: what the phone opens, shares or downloads.
// Same answer as the back office's `/app/deliverables/file`; an expert's file never runs script on this origin.
export async function GET(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const q = new URL(request.url).searchParams;
    const path = q.get("p") ?? "";
    const key = fileLinkKey();
    const workspace = (await pinnedWorkspaceId()) ?? "";
    if (!key || !insideLivrables(path) || !verifyFileLink(key, workspace, id, path, Number(q.get("e")), q.get("s") ?? "")) {
      throw new ApiError(404, "not_found", "Lien expiré ou invalide.");
    }
    const upstream = await instanceFetch(id, `/v1/files/content?path=${encodeURIComponent(`~/${path}`)}`);
    if (!upstream.ok || !upstream.body) {
      await upstream.body?.cancel().catch(() => undefined);
      throw new ApiError(404, "not_found", "Fichier introuvable.");
    }
    const headers = new Headers({
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(path.split("/").at(-1) ?? "fichier")}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
    });
    const length = upstream.headers.get("content-length");
    if (length) headers.set("Content-Length", length);
    return new Response(upstream.body, { status: 200, headers });
  } catch (e) {
    return handleError(e);
  }
}

export const maxDuration = 300;
