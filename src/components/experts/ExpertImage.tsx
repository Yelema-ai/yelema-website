"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

// An expert's picture from the back-office catalogue, resized for where it is shown.
//
// The catalogue serves each picture once, full size (a portrait is several hundred KB). Pictures
// served by a Yelema host go through Next's image optimizer, which hands the browser a WebP at the
// size the layout needs and caches it. Any other address (a signed media URL, another CDN) is shown
// as it is: those hosts are not known at build time, and a signed URL must not be rewritten.
//
// While it loads, the picture fades in over its parent's background instead of popping in. If the
// optimizer cannot read it, the original address is tried once; if that fails too, nothing is
// drawn (the parent's color or initial stays), never the browser's broken-image icon.
//
// Keep in sync with `images.remotePatterns` in next.config.ts.
export function optimizable(src: string): boolean {
  try {
    const url = new URL(src);
    return url.protocol === "https:" && url.hostname.endsWith(".yelema.ai") && (url.pathname.startsWith("/api/public/experts/") || url.pathname.startsWith("/api/public/expert-avatars/"));
  } catch {
    return false;
  }
}

type Props = { src: string; className?: string; priority?: boolean } & (
  | { size: number; sizes?: never }
  // Fills its (positioned) parent; `sizes` tells the browser how wide that is, as in <img sizes>.
  | { size?: never; sizes: string }
);

// Pictures this tab has already shown. A face drawn again (menu folded or unfolded, a cycle
// opened, another page) is in the browser's cache: it shows at once, without the initial and the
// fade in between (Leslie, 03/11: « les avatars prennent du temps pour apparaître »).
const shown = new Set<string>();

export function ExpertImage({ src, className, priority, size, sizes }: Props) {
  // Keyed on the address: a new picture starts again from its own loading state.
  return <Picture key={src} src={src} className={className} priority={priority} size={size} sizes={sizes} />;
}

function Picture({ src, className, priority, size, sizes }: { src: string; className?: string; priority?: boolean; size?: number; sizes?: string }) {
  const [attempt, setAttempt] = useState<"optimized" | "original" | "failed">(optimizable(src) ? "optimized" : "original");
  const [loaded, setLoaded] = useState(() => shown.has(src));
  if (attempt === "failed") return null;
  const common = {
    src,
    alt: "",
    priority,
    // A face is a few KB and always in sight (menu, header): never wait for the lazy loader.
    loading: priority ? undefined : ("eager" as const),
    unoptimized: attempt === "original",
    className: cn(loaded ? "opacity-100" : "opacity-0 transition-opacity duration-150", className),
    onLoad: () => {
      shown.add(src);
      setLoaded(true);
    },
    onError: () => setAttempt((a) => (a === "optimized" ? "original" : "failed")),
  };
  return size ? <Image {...common} width={size} height={size} /> : <Image {...common} fill sizes={sizes} />;
}
