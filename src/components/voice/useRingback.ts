"use client";

import { useEffect } from "react";

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
      ctx = new AudioContext();
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
