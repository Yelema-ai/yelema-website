import { agent37 } from "@/lib/agent37";
import { requireAgentAccess } from "@/lib/auth";
import { handleError, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// The instance's screen ("Son ordinateur"): the yelema-hermes image streams it with noVNC on port
// 6901. We mint a signed URL for that port and hand the browser only the WebSocket URL built from
// it; the token rides in its query string, so the page connects straight to the instance with no
// cookie. The token grants full control (clicks and keys), whatever the page does with it, and
// cannot be revoked: it goes only to the instance's owner or a workspace admin, for the 60-second
// minimum, since it only has to be valid when the socket opens. Every reconnect asks for a fresh one.
export async function POST(_request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    await requireAgentAccess(id);
    const signed = new URL((await agent37.signedUrl(id, 6901, 60)).url);
    return json({ ws: `wss://${signed.host}/websockify?a37_token=${encodeURIComponent(signed.searchParams.get("a37_token") ?? "")}` });
  } catch (e) {
    return handleError(e);
  }
}
