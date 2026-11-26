import type { CallPhase } from "./call-turns.ts";

// The tone that closes an answered call: three short beeps when the other side ends it (expert, server,
// network), one when the member hangs up. Pure: the hook plays what this decides, on a player it passes.

export const END_HZ = 425;
export const END_BEEP_S = 0.15;
export const END_GAP_S = 0.15;

/** Who closed the call: the member (« Raccrocher »), or anything else. */
export type EndedBy = "member" | "remote";

/** Beeps to play when a call goes to `next`; 0 for no tone (never answered, or not an end). */
export function endBeeps(next: CallPhase, by: EndedBy, answered: boolean): number {
  if (!answered || (next !== "ended" && next !== "unreachable")) return 0;
  return by === "member" ? 1 : 3;
}

/** Plays the end tone through `play`; a player that throws never reaches the hang-up. */
export function sound(play: (beeps: number) => void, next: CallPhase, by: EndedBy, answered: boolean): void {
  const n = endBeeps(next, by, answered);
  if (!n) return;
  try {
    play(n);
  } catch {
    // no sound rather than a stuck hang-up
  }
}
