"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ExpertImage } from "@/components/experts/ExpertImage";
import { cn } from "@/lib/utils";

// Hover videos only with a real mouse, and never when the user asked for less motion.
const VIDEO_QUERY = "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(VIDEO_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function useHoverVideo(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(VIDEO_QUERY).matches,
    () => false
  );
}

// "Djénéba" -> "djeneba": how the video files in /public/experts/vid are named.
function fileName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * An expert's picture on a card, swapped for their looping video while `hovered`. Fills its
 * (positioned) parent.
 *
 * The picture comes from the catalogue. So does the video when the catalogue lists one; until
 * then it is looked for in /public/experts/vid under the expert's first name. No video there
 * either: the picture stays, which is all a visitor sees.
 */
export function ExpertMedia({
  name,
  image,
  videoUrl,
  hovered,
  sizes,
}: {
  name: string;
  image: string | null;
  videoUrl?: string | null;
  hovered: boolean;
  sizes: string;
}) {
  const enabled = useHoverVideo();
  const ref = useRef<HTMLVideoElement>(null);
  // The video element is created on the first hover, so a page of cards asks for no video at all.
  const [wanted, setWanted] = useState(false);
  const [missing, setMissing] = useState(false);
  const [playing, setPlaying] = useState(false);
  const file = fileName(name);
  const src = videoUrl ?? (file ? `/experts/vid/${file}.mp4` : null);
  const show = enabled && wanted && !missing && src !== null;

  useEffect(() => {
    if (hovered && enabled) setWanted(true);
  }, [hovered, enabled]);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (hovered) {
      void video.play().catch(() => {});
    } else {
      video.pause();
      setPlaying(false);
    }
  }, [hovered, show]);

  return (
    <>
      {image ? (
        <ExpertImage src={image} sizes={sizes} className="object-cover object-top" />
      ) : (
        <span className="absolute inset-0 grid place-items-center font-display text-7xl font-bold text-white/60">
          {name.trim()[0]?.toUpperCase() ?? "?"}
        </span>
      )}
      {show && (
        <video
          ref={ref}
          src={src}
          muted
          loop
          playsInline
          preload="none"
          aria-hidden
          onPlaying={() => setPlaying(true)}
          onError={() => setMissing(true)}
          className={cn(
            "absolute inset-0 h-full w-full object-cover object-top opacity-0 transition-opacity duration-300",
            playing && hovered && "opacity-100"
          )}
        />
      )}
    </>
  );
}
