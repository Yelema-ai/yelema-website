"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VoiceCall, type AethexError } from "@aethexai/react/core";
import type { VoiceLanguage } from "@/lib/voice";

// One call with an expert, from the browser. Signaling goes to this app's own /api/voice, which adds
// the session and the workspace; only the audio goes straight to Aethex (WebRTC). Ported from the
// voice app's aethexCall.ts: "speaking" is read from the expert's output level, the SDK says nothing else.

export type CallPhase = "idle" | "connecting" | "listening" | "speaking" | "reconnecting" | "ended" | "unreachable";

const VOICE_BASE = "/api/voice";
const LEVEL_MS = 80;
const VOICE_ON = 0.02;
const VOICE_OFF = 0.01;
const VOICE_START_MS = 120;
const VOICE_END_MS = 700;

function messageOf(e: AethexError): string | null {
  if (e.code === "mic_denied" || e.code === "mic_missing") return "Autorisez le micro pour appeler vos experts.";
  if (e.code === "unsupported_browser") return "Ce navigateur ne permet pas les appels. Essayez Chrome, Edge ou Safari à jour.";
  if (e.code === "quota_exceeded" || e.code === "payment_required" || e.code === "capacity") return "Service vocal indisponible. Réessayez dans un instant.";
  return null;
}

export interface UseVoiceCall {
  phase: CallPhase;
  /** Why the call could not go on, in French; null when it ended normally. */
  reason: string | null;
  muted: boolean;
  /** Seconds since the expert picked up. */
  elapsed: number;
  start(input: { expert: string; language: VoiceLanguage; voice: string | null }): void;
  hangUp(): void;
  setMuted(muted: boolean): void;
}

export function useVoiceCall(): UseVoiceCall {
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [reason, setReason] = useState<string | null>(null);
  const [muted, setMutedState] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const call = useRef<VoiceCall | null>(null);
  const timers = useRef<ReturnType<typeof setInterval>[]>([]);
  const phaseRef = useRef<CallPhase>("idle");

  const go = useCallback((next: CallPhase) => {
    if (phaseRef.current === "ended" || phaseRef.current === "unreachable") return;
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const release = useCallback(() => {
    timers.current.forEach(clearInterval);
    timers.current = [];
    call.current?.stop();
    call.current = null;
  }, []);

  const fail = useCallback(
    (why: string | null) => {
      release();
      setReason(why ?? "L’expert est injoignable pour le moment. Réessayez dans un instant.");
      go("unreachable");
    },
    [go, release]
  );

  // The expert talks while its voice is above the threshold, and has finished after a held silence.
  const meter = useCallback(() => {
    let since = 0;
    let silent = 0;
    return () => {
      const level = call.current?.getOutputLevel() ?? 0;
      const now = Date.now();
      const state = phaseRef.current;
      if (state !== "listening" && state !== "speaking") return;
      if (level >= (state === "listening" ? VOICE_ON : VOICE_OFF)) {
        silent = 0;
        since ||= now;
        if (state === "listening" && now - since >= VOICE_START_MS) go("speaking");
      } else {
        since = 0;
        silent ||= now;
        if (state === "speaking" && now - silent >= VOICE_END_MS) go("listening");
      }
    };
  }, [go]);

  const start = useCallback<UseVoiceCall["start"]>(
    ({ expert, language, voice }) => {
      release();
      phaseRef.current = "connecting";
      setPhase("connecting");
      setReason(null);
      setElapsed(0);
      let refusal: string | null = null;
      // The back office's refusal ("Cet expert n'est pas encore disponible.") is in the body, which the SDK does not read.
      const fetchImpl: typeof fetch = async (input, init) => {
        const res = await fetch(input, init);
        if (!res.ok && String(input).endsWith(`${VOICE_BASE}/calls`)) {
          refusal = ((await res.clone().json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message ?? null;
        }
        return res;
      };
      let connected = false;
      try {
        const c = new VoiceCall({
          agentId: "yelema", // ignored: the back office picks the agent
          apiBaseUrl: VOICE_BASE,
          endpoints: { connect: "calls", offer: "calls/:id/offer", ice: "calls/:id/ice", end: "calls/:id/end", status: "calls/:id/status" },
          headers: { "X-Yelema-Expert": expert, "X-Yelema-Language": language, ...(voice ? { "X-Yelema-Voice": voice } : {}) },
          fetchImpl,
          callbacks: {
            onStatusChange: (s) => {
              if (s === "connected" && !connected) {
                connected = true;
                go("listening");
                const t0 = Date.now();
                timers.current.push(setInterval(meter(), LEVEL_MS), setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000));
              } else if (s === "ended") {
                release();
                go("ended");
              }
            },
            onPeerStateChange: (p) => {
              if (!connected) return;
              if (p === "disconnected" || p === "failed") go("reconnecting");
              else if (p === "connected" && phaseRef.current === "reconnecting") go("listening");
            },
            onError: (e) => fail(refusal ?? messageOf(e)),
            onClose: () => {
              release();
              go("ended");
            },
          },
        });
        call.current = c;
        c.start().catch(() => fail(refusal));
      } catch {
        fail(refusal);
      }
    },
    [fail, go, meter, release]
  );

  const hangUp = useCallback(() => {
    release();
    go("ended");
  }, [go, release]);

  const setMuted = useCallback((m: boolean) => {
    setMutedState(m);
    call.current?.setMuted(m);
  }, []);

  // Leaving the page hangs up: the SDK sends `end`, and the back office closes the call at Aethex.
  useEffect(() => release, [release]);

  return { phase, reason, muted, elapsed, start, hangUp, setMuted };
}
