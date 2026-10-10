import { backoffice } from "@/lib/backoffice";
import { handleError } from "@/lib/http";
import { mailToken } from "../../../../../_session";

export const maxDuration = 120;

// `GET /api/mail/{expert}/messages/{id}/attachments/{att}` — the file, piped from the back office and
// always as a download: an attachment is anyone's file and must never render on this origin.
export async function GET(_request: Request, { params }: { params: Promise<{ expert: string; id: string; att: string }> }) {
  try {
    const { expert, id, att } = await params;
    const upstream = await backoffice.mailAttachment(await mailToken(), expert, id, att);
    return new Response(upstream.body, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": upstream.headers.get("content-disposition") ?? "attachment",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
