"use client";

import { getImageProps } from "next/image";
import { optimizable } from "@/lib/expert-image";

// The expert's face in the call, at the portrait's size: a light picture through the image optimizer
// when its host allows it, the original otherwise. The « Appeler » button loads it ahead (shown,
// hovered or focused), so the face is there the moment the call opens.

export const FACE_PX = 176;

// `original`: the picture as its host serves it, when the optimizer could not give it (Leslie, 23/11, QA :
// an empty circle during the call, while the same face showed everywhere else through ExpertImage's fallback).
export function faceProps(src: string, original = false) {
  return getImageProps({ src, alt: "", width: FACE_PX, height: FACE_PX, unoptimized: original || !optimizable(src) }).props;
}

const loaded = new Set<string>();

export function preloadFace(src: string | null): void {
  if (!src || loaded.has(src) || typeof window === "undefined") return;
  loaded.add(src);
  const p = faceProps(src);
  const img = new window.Image();
  if (p.srcSet) img.srcset = p.srcSet;
  img.src = p.src;
}
