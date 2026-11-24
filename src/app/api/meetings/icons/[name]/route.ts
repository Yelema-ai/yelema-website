import sharp from "sharp";
import { clientIp, rateWindow } from "@/lib/guest-access";
import { memo } from "@/lib/memo";
import { EMAIL_ASSETS_PATH, isTintedIcon } from "@/lib/meetings/email-icons";
import { isHexColor } from "@/lib/meetings/minutes-palette";

type Ctx = { params: Promise<{ name: string }> };

const ICON_FILE = /^([a-z-]{1,32})\.png$/;
const MAX_SOURCE_BYTES = 64 * 1024;
const tinted = memo<Uint8Array>({ ttlMs: 24 * 60 * 60_000, maxEntries: 500 });
const sources = memo<Buffer>({ ttlMs: 24 * 60 * 60_000, maxEntries: 64 });
// An icon is a few dozen pixels wide; a colour not yet made costs a decode: so many a minute per address.
const MAX_PIXELS = 512 * 512;
const newTints = rateWindow(30, 60_000);
const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const refuse = (status: number) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });

async function source(origin: string, name: string): Promise<Buffer> {
  const res = await fetch(`${origin}${EMAIL_ASSETS_PATH}/${name}.png`, { signal: AbortSignal.timeout(5_000) });
  if (!res.ok) throw new Error(`icon ${name}: ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());
  if (body.byteLength > MAX_SOURCE_BYTES) throw new Error(`icon ${name}: too large`);
  if (!body.subarray(0, 8).equals(PNG_HEAD)) throw new Error(`icon ${name}: not a PNG`);
  return body;
}

async function tint(png: Buffer, hex: string): Promise<Uint8Array> {
  const [r, g, b] = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));
  const { data, info } = await sharp(png, { limitInputPixels: MAX_PIXELS }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
  return new Uint8Array(await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer());
}

export async function GET(request: Request, { params }: Ctx): Promise<Response> {
  const name = ICON_FILE.exec((await params).name)?.[1];
  const color = `#${new URL(request.url).searchParams.get("c") ?? ""}`.toLowerCase();
  if (!name || !isTintedIcon(name)) return refuse(404);
  if (!isHexColor(color)) return refuse(400);
  try {
    const origin = new URL(request.url).origin;
    const key = `${name}\n${color}`;
    if (!tinted.peek(key)) {
      const ip = clientIp(request.headers, process.env.VERCEL === "1");
      const hit = newTints(ip || "?", Date.now());
      if (!hit.ok) return new Response(null, { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(hit.retryAfter) } });
    }
    const png = await tinted.get(key, async () => tint(await sources.get(name, () => source(origin, name)), color));
    return new Response(png as BodyInit, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" } });
  } catch (e) {
    console.error("[meetings] icon:", e instanceof Error ? e.message : e);
    return refuse(502);
  }
}

export const runtime = "nodejs";
