import sharp from "sharp";
import { instanceFetch } from "@/lib/agent37";
import { requireAgentAccess } from "@/lib/auth";
import { assertInDrive } from "@/lib/drive";
import { ApiError, handleError } from "@/lib/http";
import { atMost, boundedCache, isThumbable, looksLikeImage, thumbWidth } from "@/lib/thumbs";
import { assertUpstreamOk, requireTrimmed } from "../../_helpers";

type Ctx = { params: Promise<{ id: string }> };

const MAX_SOURCE = 40 * 1024 * 1024;
const FAILED = "L’aperçu n’a pas pu être préparé.";
// Per server instance: a few hundred previews, an hour at most.
const cache = boundedCache<Buffer>(48 * 1024 * 1024, 60 * 60_000);
// A decoded picture holds its pixels in memory: three at a time per server instance.
const decoding = atMost(3);

async function readCapped(res: Response): Promise<Buffer> {
  if (Number(res.headers.get("content-length") ?? 0) > MAX_SOURCE) throw new ApiError(413, "too_large", FAILED);
  const reader = res.body?.getReader();
  if (!reader) throw new ApiError(502, "thumb_error", FAILED);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return Buffer.concat(chunks, total);
    total += value.byteLength;
    if (total > MAX_SOURCE) {
      await reader.cancel();
      throw new ApiError(413, "too_large", FAILED);
    }
    chunks.push(value);
  }
}

// A drive picture reduced to a preview width, as WebP. `v` (the file's mtime) names the version, so a
// versioned answer is cached by the browser; the original stays one click away on the content route.
export async function GET(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    await requireAgentAccess(id);
    const { searchParams } = new URL(request.url);
    const path = assertInDrive(requireTrimmed(searchParams.get("path"), "Chemin manquant"));
    if (!isThumbable(path)) throw new ApiError(415, "not_an_image", "Pas d’aperçu pour ce type de fichier.");
    const width = thumbWidth(searchParams.get("w"));
    const version = /^\d{1,15}$/.test(searchParams.get("v") ?? "") ? searchParams.get("v") : null;

    const make = async () => {
      const upstream = await instanceFetch(id, `/v1/files/content?path=${encodeURIComponent(path)}`);
      await assertUpstreamOk(upstream, "files/thumb", FAILED, "thumb_error");
      const source = await readCapped(upstream);
      if (!looksLikeImage(source)) throw new ApiError(415, "not_an_image", "Pas d’aperçu pour ce type de fichier.");
      return decoding(() =>
        sharp(source, { limitInputPixels: 120_000_000, failOn: "none" })
          .rotate()
          .resize({ width, height: width, fit: "inside", withoutEnlargement: true })
          .webp({ quality: 78 })
          .toBuffer()
      );
    };
    // Unversioned: rebuilt each time, the file may have changed under the same name.
    const body = version ? await cache.get(`${id}\n${path}\n${version}\n${width}`, make) : await make();

    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": "image/webp",
        "Content-Length": String(body.byteLength),
        "Cache-Control": version ? "private, max-age=86400, immutable" : "private, no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
