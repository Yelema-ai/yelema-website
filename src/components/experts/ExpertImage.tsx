import Image from "next/image";

// An expert's picture from the back-office catalogue, resized for where it is shown.
//
// The catalogue serves each picture once, full size (a portrait is several hundred KB). Pictures
// served by a Yelema host go through Next's image optimizer, which hands the browser a WebP at the
// size the layout needs and caches it. Any other address (a signed media URL, another CDN) is shown
// as it is: those hosts are not known at build time, and a signed URL must not be rewritten.
//
// Keep in sync with `images.remotePatterns` in next.config.ts.
function optimizable(src: string): boolean {
  try {
    const url = new URL(src);
    return url.protocol === "https:" && url.hostname.endsWith(".yelema.ai") && url.pathname.startsWith("/api/public/experts/");
  } catch {
    return false;
  }
}

type Props = { src: string; className?: string; priority?: boolean } & (
  | { size: number; sizes?: never }
  // Fills its (positioned) parent; `sizes` tells the browser how wide that is, as in <img sizes>.
  | { size?: never; sizes: string }
);

export function ExpertImage({ src, className, priority, size, sizes }: Props) {
  const common = { src, alt: "", className, priority, unoptimized: !optimizable(src) };
  return size ? <Image {...common} width={size} height={size} /> : <Image {...common} fill sizes={sizes} />;
}
