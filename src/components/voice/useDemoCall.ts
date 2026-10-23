"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CallPhase } from "@/lib/call-turns";
import type { Caption, UseVoiceCall } from "./useVoiceCall";
import { playHangupTone } from "./useRingback";

// A call that plays itself, for screenshots and design reviews only: no microphone, no Aethex, no
// back office. It is offered in development alone, once `localStorage["yelema.demo-appel"] = "1"`;
// a production build never takes it (see CallProvider). `window.__yelemaDemoCall.end()` makes the
// expert hang up.

export const DEMO_CALL_KEY = "yelema.demo-appel";

export function demoCallEnabled(): boolean {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return false;
  try {
    return localStorage.getItem(DEMO_CALL_KEY) === "1";
  } catch {
    return false;
  }
}

const CYCLE: CallPhase[] = ["listening", "thinking", "speaking"];

// A short exchange, shown line by line, for the live transcript.
const SCRIPT: Omit<Caption, "at">[] = [
  { who: "expert", text: "Bonjour, je vous écoute." },
  { who: "member", text: "Bonjour. J’aimerais faire le point sur les devis." },
  { who: "member", text: "Où en sont les devis de la semaine dernière ?" },
  { who: "expert", text: "Trois devis attendent une réponse depuis plus de sept jours. Je vous propose de les relancer ce matin." },
  { who: "member", text: "Retrouve-moi le dernier devis de Yao." },
  { who: "expert", text: "Je regarde dans vos mails et le Drive, un instant." },
];

export function useDemoCall(): UseVoiceCall {
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [muted, setMuted] = useState(false);
  const [longer, setLonger] = useState(false);
  const [holding, setHolding] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [tool, setTool] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const flags = useRef({ longer: false, holding: false });

  const stop = useCallback(() => {
    timers.current.forEach((t) => clearInterval(t));
    timers.current = [];
  }, []);

  const end = useCallback(() => {
    stop();
    playHangupTone();
    setPhase("ended");
  }, [stop]);

  const start = useCallback<UseVoiceCall["start"]>(() => {
    stop();
    setPhase("connecting");
    setElapsed(0);
    setMuted(false);
    setLonger(false);
    setHolding(false);
    setCaptions([]);
    setTool(false);
    flags.current = { longer: false, holding: false };
    const params = new URLSearchParams(window.location.search);
    // Start the clock where a screenshot wants it (?appel-t=42), the phase too (?appel-phase=speaking).
    const t0 = Date.now() - Number(params.get("appel-t") ?? 0) * 1000;
    // ?appel-phase=tool: the expert searches; ?appel-muet=1: the microphone is cut;
    // ?appel-lignes=4: that many lines of the transcript at once.
    const asked = params.get("appel-phase");
    const fixed = (asked === "tool" ? "thinking" : asked) as CallPhase | null;
    if (fixed === "connecting") return;
    const lines = Number(params.get("appel-lignes") ?? 0);
    timers.current.push(
      setTimeout(() => {
        let i = 0;
        let line = lines;
        setPhase(fixed ?? "listening");
        setTool(asked === "tool");
        if (params.get("appel-muet") === "1") setMuted(true);
        setCaptions(SCRIPT.slice(0, line).map((c, k) => ({ ...c, at: t0 + k * 5000 })));
        timers.current.push(
          setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000),
          setInterval(() => {
            if (fixed) return;
            i = (i + 1) % CYCLE.length;
            setPhase(CYCLE[i]);
            if (line < SCRIPT.length) {
              const c = { ...SCRIPT[line++], at: Date.now() };
              setCaptions((all) => [...all, c]);
            }
          }, 3000)
        );
        setElapsed(Math.floor((Date.now() - t0) / 1000));
      }, 1200)
    );
  }, [stop]);

  useEffect(() => {
    (window as unknown as { __yelemaDemoCall?: { end: () => void } }).__yelemaDemoCall = { end };
    return stop;
  }, [end, stop]);

  return {
    phase,
    reason: null,
    muted,
    longer,
    holding,
    elapsed,
    captions,
    tool,
    start,
    hangUp: end,
    setMuted,
    toggleLonger: () => {
      flags.current.longer = !flags.current.longer;
      setLonger(flags.current.longer);
      return flags.current.longer;
    },
    toggleHold: () => {
      flags.current.holding = !flags.current.holding;
      setHolding(flags.current.holding);
      return flags.current.holding;
    },
  };
}
