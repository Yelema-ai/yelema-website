import { instanceFetch } from "@/lib/agent37";
import { requireAgentAccess } from "@/lib/auth";
import { backoffice } from "@/lib/backoffice";
import { assertInDrive } from "@/lib/drive";
import { ApiError, handleError, json, readJson } from "@/lib/http";
import { mailToken as sessionToken, noStore } from "../../mail/_session";

const COPY_FAILED = "La charte n’a pas pu être reprise des livrables. Réessayez.";

// `POST /api/memory/charte` — « En faire la charte de l’entreprise »: a brand book Koffi delivered in
// the member's drive becomes the company's « Charte graphique » in the Contexte, in one click
// (Leslie, 01/11: Koffi writes nothing in the memory himself). The file goes from the instance to the
// back office here, server side, so the 4 MB browser limit does not apply. With `replace`, the
// deposited brand book gets a new version instead of a second deposit.
export async function POST(request: Request) {
  try {
    const { agentId, path, replace } = await readJson<{ agentId: string; path: string; replace?: string | null }>(request);
    await requireAgentAccess(agentId);
    const file = assertInDrive(String(path ?? "").trim());
    const upstream = await instanceFetch(agentId, `/v1/files/content?${new URLSearchParams({ path: file })}`);
    if (!upstream.ok) throw new ApiError(502, "download_error", COPY_FAILED);
    const type = upstream.headers.get("content-type") ?? "application/octet-stream";
    const name = file.split("/").pop() || "charte.pdf";
    const form = new FormData();
    form.set("file", new File([await upstream.arrayBuffer()], name, { type }));
    const token = await sessionToken();
    if (replace) return noStore(json(await backoffice.uploadMemoryVersion(token, replace, form)));
    form.set("title", "Charte graphique");
    return noStore(json(await backoffice.uploadMemoryDocument(token, form)));
  } catch (e) {
    return handleError(e);
  }
}
