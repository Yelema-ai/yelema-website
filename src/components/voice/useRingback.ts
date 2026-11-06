"use client";

import { useEffect } from "react";
import { beepTimes } from "@/lib/connection-tone";
import { END_BEEP_S, END_GAP_S, END_HZ } from "@/lib/end-tone";
import { newAudioContext } from "@/lib/mic-tap";

// The ringback heard while the call is being put through, like a phone: 440 Hz, 1.5 s on, 3.5 s
// off (the French tone). Synthesised, no file to load; it stops as soon as the line is open.
const ON_S = 1.5;
const CYCLE_S = 5;
const VOLUME = 0.08;

export function useRingback(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    let ctx: AudioContext;
    try {
      ctx = newAudioContext();
    } catch {
      return;
    }
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
    const tone = ctx.createOscillator();
    tone.frequency.value = 440;
    tone.connect(gain);
    tone.start();
    // A few minutes of cycles scheduled ahead; ramps avoid clicks at each edge.
    for (let t = ctx.currentTime, i = 0; i < 60; i++, t += CYCLE_S) {
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(VOLUME, t + 0.02);
      gain.gain.setValueAtTime(VOLUME, t + ON_S - 0.02);
      gain.gain.linearRampToValueAtTime(0, t + ON_S);
    }
    return () => {
      tone.stop();
      void ctx.close().catch(() => {});
    };
  }, [active]);
}

// Opened during the click that starts the call: a browser lets a page play sound only from a
// context a gesture started, and the expert may hang up long after, with no click (Leslie, 25/10:
// no tone when the expert hangs up). The connection tone plays on it during the call, the end tone
// at its end, then it is released.
let primed: AudioContext | null = null;

/** The call's context, opened at the click; null when there is none. */
export function callAudioContext(): AudioContext | null {
  return primed && primed.state !== "closed" ? primed : null;
}

/** Closes the call's context when no end tone took it (the expert never answered). */
export function releaseCallAudio(): void {
  const c = primed;
  primed = null;
  void c?.close().catch(() => {});
}

export function primeHangupTone(): void {
  if (primed) return;
  try {
    primed = newAudioContext();
  } catch {
    primed = null;
  }
}

/** The end tone (src/lib/end-tone.ts): `beeps` short beeps at 425 Hz, then the context is released. */
export function playHangupTone(beeps: number): void {
  if (beeps < 1) return;
  let ctx: AudioContext;
  if (primed && primed.state !== "closed") {
    ctx = primed;
    void ctx.resume().catch(() => {});
  } else {
    try {
      ctx = newAudioContext();
    } catch {
      return;
    }
  }
  primed = null;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(ctx.destination);
  const tone = ctx.createOscillator();
  tone.frequency.value = END_HZ;
  tone.connect(gain);
  const times = beepTimes(ctx.currentTime + 0.02, beeps, END_BEEP_S, END_GAP_S);
  for (const [on, off] of times) {
    gain.gain.setValueAtTime(0, on);
    gain.gain.linearRampToValueAtTime(VOLUME, on + 0.015);
    gain.gain.setValueAtTime(VOLUME, off - 0.015);
    gain.gain.linearRampToValueAtTime(0, off);
  }
  const end = times[times.length - 1][1];
  tone.start(times[0][0]);
  tone.stop(end);
  // Released when the beeps end, or after their time if they never played (a context Safari kept
  // suspended never fires `ended`): Safari allows only a few contexts at once.
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    void ctx.close().catch(() => {});
  };
  tone.onended = close;
  setTimeout(close, (end - ctx.currentTime + 0.5) * 1000);
}
