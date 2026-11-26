// What the screen relay sends, checked before it is drawn, and the pace at which pictures are decoded. Pure: tested.

export type Frame = { t: "frame"; data: string; w?: number; h?: number } | { t: "empty" } | { t: "tabs" };

/** A JPEG larger than this (base64) is not a screen: dropped. */
export const MAX_FRAME_CHARS = 8 * 1024 * 1024;
/** The canvas never grows past this side. */
export const MAX_FRAME_SIDE = 4096;

const side = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 16_384 ? v : undefined);

/** The message as a frame, or null for anything else (not JSON, another shape, a picture too large or not base64). */
export function parseFrame(raw: unknown): Frame | null {
  let m: { t?: unknown; data?: unknown; w?: unknown; h?: unknown } | null;
  try {
    m = JSON.parse(String(raw));
  } catch {
    return null;
  }
  if (!m || typeof m !== "object") return null;
  if (m.t === "empty" || m.t === "tabs") return { t: m.t };
  if (m.t !== "frame" || typeof m.data !== "string" || !m.data || m.data.length > MAX_FRAME_CHARS || !/^[A-Za-z0-9+/]+=*$/.test(m.data)) return null;
  return { t: "frame", data: m.data, w: side(m.w), h: side(m.h) };
}

/**
 * One item worked on at a time; while it is, only the latest one given waits (the others are dropped).
 * `work` calls `done` when it has finished, whatever the outcome.
 */
export function latestOnly<T>(work: (item: T, done: () => void) => void): (item: T) => void {
  let busy = false;
  let waiting: { item: T } | null = null;
  const start = (item: T): void => {
    busy = true;
    let ended = false;
    work(item, () => {
      if (ended) return;
      ended = true;
      busy = false;
      const next = waiting;
      waiting = null;
      if (next) start(next.item);
    });
  };
  return (item) => {
    if (busy) waiting = { item };
    else start(item);
  };
}
