import { backoffice } from "@/lib/backoffice";
import { handleError } from "@/lib/http";
import { mailCsp, sandboxedMail } from "@/lib/mail";
import { mailToken } from "../../../../_session";

// `GET /api/mail/{expert}/messages/{id}/frame` — the message as its own sandboxed document, remote pictures
// allowed: what the reader gets after « Afficher les images ». Served here, with its own policy, so the page's
// policy (which names the hosts pictures may come from) does not have to open to every sender.
export async function GET(_request: Request, { params }: { params: Promise<{ expert: string; id: string }> }) {
  try {
    const { expert, id } = await params;
    const message = await backoffice.mailMessage(await mailToken(), expert, id);
    return new Response(sandboxedMail(message.html ?? "", true), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
        "Content-Security-Policy": `sandbox; ${mailCsp(true)}; frame-ancestors 'self'`,
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
