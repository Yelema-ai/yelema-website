import { NextResponse } from "next/server";
import { getPublicKey } from "nostr-tools/pure";
import { hexToBytes } from "nostr-tools/utils";
import { BackofficeError } from "@/lib/backoffice";
import { GuestPostError, guestHistory, guestPost } from "@/lib/guest-thread";
import { pooledRelay } from "@/lib/guest-relay";
import { guardPost, guestContext, guestFailure, noStore, salonNames, tooMany } from "@/lib/guest-session";
import { apiError, json, readJson } from "@/lib/http";

// `/invite/salon/messages` — the guest's salon thread, read and written by this server with the guest's key:
// GET the last messages (`before`, `limit`) and the guest's public key (`me`), POST `{ content, replyTo? }` one message of this salon, nothing else.

const unavailable = () => noStore(apiError("Le salon est momentanément indisponible. Réessayez dans un instant.", 503, "unavailable"));

export async function GET(request: Request) {
  const g = await guestContext(request);
  if (g instanceof NextResponse) return g;
  const limited = tooMany("read", g.tag);
  if (limited) return limited;
  const q = new URL(request.url).searchParams;
  const before = Number(q.get("before"));
  try {
    const names = await salonNames(g.cookie.session, g.ip);
    const relay = await pooledRelay(g.tag, g.view.relay.url, g.cookie.secret);
    const page = await guestHistory(relay, g.view.salon.channel, names, Number.isInteger(before) && before > 0 ? before : null, Number(q.get("limit")) || undefined);
    return noStore(json({ ...page, me: getPublicKey(hexToBytes(g.cookie.secret)), now: Math.floor(Date.now() / 1000) }));
  } catch (e) {
    return e instanceof BackofficeError ? noStore(guestFailure(e)) : unavailable();
  }
}

export async function POST(request: Request) {
  const refused = guardPost(request, "message");
  if (refused) return refused;
  const g = await guestContext(request);
  if (g instanceof NextResponse) return g;
  const limited = tooMany("post", g.tag);
  if (limited) return limited;
  const body = await readJson<{ content?: unknown; replyTo?: unknown }>(request);
  try {
    const names = await salonNames(g.cookie.session, g.ip);
    const relay = await pooledRelay(g.tag, g.view.relay.url, g.cookie.secret);
    return noStore(json({ message: await guestPost(relay, g.view.salon.channel, names, body.content, body.replyTo) }, 201));
  } catch (e) {
    if (e instanceof GuestPostError) return noStore(apiError(e.message, e.status, e.code));
    return e instanceof BackofficeError ? noStore(guestFailure(e)) : unavailable();
  }
}
