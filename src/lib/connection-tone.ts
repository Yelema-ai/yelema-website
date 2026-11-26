import type { CallPhase } from "./call-turns.ts";

// The tone heard while a call's connection is lost: two soft short beeps, again every few seconds
// until the line is back; a brief higher chime when it is. Pure: the hook plays what this decides.

export const LOST_HZ = 440;
export const BACK_HZ = 660;
export const BEEP_S = 0.15;
export const BEEP_GAP_S = 0.1;
export const TONE_EVERY_MS = 3500;
export const TONE_VOLUME = 0.05;

/** The connection is down during a call: the tone loops. */
export const lostConnection = (phase: CallPhase): boolean => phase === "reconnecting";

/** The line came back to the conversation (not a hang-up during the loss). */
export const reconnected = (prev: CallPhase, next: CallPhase): boolean =>
  prev === "reconnecting" && (next === "listening" || next === "speaking" || next === "thinking");

/** [start, end] of each beep, in seconds from `t0`. */
export function beepTimes(t0: number, count: number, on = BEEP_S, gap = BEEP_GAP_S): [number, number][] {
  return Array.from({ length: count }, (_, i) => {
    const t = t0 + i * (on + gap);
    return [t, t + on];
  });
}
