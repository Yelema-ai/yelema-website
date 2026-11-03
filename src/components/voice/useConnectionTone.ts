"use client";

import { useEffect, useRef } from "react";
import type { CallPhase } from "@/lib/call-turns";
import { BACK_HZ, beepTimes, LOST_HZ, lostConnection, reconnected, TONE_EVERY_MS, TONE_VOLUME } from "@/lib/connection-tone";
import { callAudioContext, releaseCallAudio } from "./useRingback";

// Two soft beeps every few seconds while the call's connection is lost, a chime when it is back
// (src/lib/connection-tone.ts). Played on the call's context, opened at the click (Safari).
export function useConnectionTone(phase: CallPhase, inCall: boolean): void {
  const sounding = useRef<GainNode | null>(null);
  const prev = useRef(phase);

  const play = (hz: number, count: number) => {
    const c = callAudioContext();
    if (!c) return;
    if (c.state === "suspended") void c.resume().catch(() => {});
    const gain = c.createGain();
    gain.gain.value = 0;
    gain.connect(c.destination);
    const tone = c.createOscillator();
    tone.frequency.value = hz;
    tone.connect(gain);
    const times = beepTimes(c.currentTime + 0.02, count);
    // Ramps avoid clicks at each edge.
    for (const [on, off] of times) {
      gain.gain.setValueAtTime(0, on);
      gain.gain.linearRampToValueAtTime(TONE_VOLUME, on + 0.015);
      gain.gain.setValueAtTime(TONE_VOLUME, off - 0.015);
      gain.gain.linearRampToValueAtTime(0, off);
    }
    tone.start(times[0][0]);
    tone.stop(times[times.length - 1][1]);
    tone.onended = () => gain.disconnect();
    sounding.current = gain;
  };

  const lost = inCall && lostConnection(phase);
  useEffect(() => {
    if (!lost) return;
    play(LOST_HZ, 2);
    const id = setInterval(() => play(LOST_HZ, 2), TONE_EVERY_MS);
    return () => {
      clearInterval(id);
      sounding.current?.disconnect();
      sounding.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lost]);

  useEffect(() => {
    if (reconnected(prev.current, phase)) play(BACK_HZ, 1);
    prev.current = phase;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // An answered call's end tone has already taken the context; any other end releases it here.
  useEffect(() => {
    if (!inCall) releaseCallAudio();
  }, [inCall]);
  useEffect(() => releaseCallAudio, []);
}
