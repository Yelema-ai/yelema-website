import sharp from "sharp";
import { memo } from "@/lib/memo";
import { EMAIL_ASSETS_PATH, isTintedIcon } from "@/lib/meetings/email-icons";
import { isHexColor } from "@/lib/meetings/minutes-palette";

type Ctx = { params: Promise<{ name: string }> };

const ICON_FILE = /^([a-z-]{1,32})\.png$/;
const MAX_SOURCE_BYTES = 64 * 1024;
const tinted = memo<Uint8Array>({ ttlMs: 24 * 60 * 60_000, maxEntries: 500 });

const refuse = (status: number) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });

async function source(origin: string, name: string): Promise<Buffer> {
  const res = await fetch(`${origin}${EMAIL_ASSETS_PATH}/${name}.png`, { signal: AbortSignal.timeout(5_000) });
  if (!res.ok) throw new Error(`icon ${name}: ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());
  if (body.byteLength > MAX_SOURCE_BYTES) throw new Error(`icon ${name}: too large`);
  return body;
}

async function tint(png: Buffer, hex: string): Promise<Uint8Array> {
  const [r, g, b] = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
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
    const png = await tinted.get(`${name}\n${color}`, async () => tint(await source(origin, name), color));
    return new Response(png as BodyInit, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" } });
  } catch (e) {
    console.error("[meetings] icon:", e instanceof Error ? e.message : e);
    return refuse(502);
  }
}

export const runtime = "nodejs";
