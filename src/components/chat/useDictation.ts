"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readVoicePrefs } from "@/lib/voice";
import { downsample, encodeWav } from "@/lib/wav";

// The chat's dictation: the microphone is captured as raw samples and sent as a WAV (the format
// the speech service reads), in the language chosen for the expert's calls. Ported from the voice dictation of
// feat/agentMail (ddbf907), which recorded WebM for six speech engines.

/** About 4 minutes: the speech service takes 8 MB at most. */
const MAX_SECONDS = 240;

export type DictationState = "idle" | "recording" | "transcribing";

export interface UseDictation {
  state: DictationState;
  seconds: number;
  /** Microphone level, 0 to 1, for the meter. */
  level: number;
  start(): Promise<void>;
  /** Stops and transcribes; the text goes to `onText`. */
  finish(): void;
  cancel(): void;
}

/** `expert`: catalogue key whose call language the dictation takes; French without one. */
export function useDictation({ expert, onText, onError }: { expert: string | null; onText: (text: string) => void; onError: (message: string) => void }): UseDictation {
  const [state, setState] = useState<DictationState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const rec = useRef<{ stream: MediaStream; ctx: AudioContext; node: ScriptProcessorNode; chunks: Float32Array[]; timer: ReturnType<typeof setInterval> } | null>(null);

  const release = useCallback(() => {
    const r = rec.current;
    rec.current = null;
    if (!r) return null;
    clearInterval(r.timer);
    r.node.disconnect();
    r.stream.getTracks().forEach((t) => t.stop());
    void r.ctx.close().catch(() => {});
    setLevel(0);
    return r;
  }, []);

  const transcribe = useCallback(
    async (chunks: Float32Array[], rate: number) => {
      const all = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
      chunks.reduce((at, c) => (all.set(c, at), at + c.length), 0);
      if (all.length < rate / 2) return setState("idle"); // under half a second: nothing said
      setState("transcribing");
      try {
        const form = new FormData();
        form.append("file", new Blob([encodeWav(downsample(all, rate))], { type: "audio/wav" }), "dictee.wav");
        form.append("language", expert ? readVoicePrefs(expert).language : "fr");
        const res = await fetch("/api/voice/transcribe", { method: "POST", body: form });
        const data = (await res.json().catch(() => ({}))) as { text?: string; error?: { message?: string } };
        if (!res.ok) throw new Error(data.error?.message ?? "La dictée n’a pas pu être transcrite.");
        if (data.text?.trim()) onText(data.text.trim());
        else onError("Rien n’a été entendu. Réessayez plus près du micro.");
      } catch (e) {
        onError((e as Error).message);
      } finally {
        setState("idle");
      }
    },
    [expert, onError, onText]
  );

  const finish = useCallback(() => {
    const r = release();
    if (r) void transcribe(r.chunks, r.ctx.sampleRate);
  }, [release, transcribe]);

  const start = useCallback(async () => {
    if (rec.current || !navigator.mediaDevices?.getUserMedia) return onError("Ce navigateur ne permet pas la dictée.");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const ctx = new AudioContext();
      const node = ctx.createScriptProcessor(4096, 1, 1);
      const chunks: Float32Array[] = [];
      node.onaudioprocess = (e) => {
        const data = e.inputBuffer.getChannelData(0);
        chunks.push(new Float32Array(data));
        let sum = 0;
        for (const s of data) sum += s * s;
        setLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
      };
      ctx.createMediaStreamSource(stream).connect(node);
      node.connect(ctx.destination);
      const t0 = Date.now();
      const timer = setInterval(() => {
        const s = Math.floor((Date.now() - t0) / 1000);
        setSeconds(s);
        if (s >= MAX_SECONDS) finish();
      }, 250);
      rec.current = { stream, ctx, node, chunks, timer };
      setSeconds(0);
      setState("recording");
    } catch (e) {
      const denied = (e as DOMException).name === "NotAllowedError";
      onError(denied ? "Autorisez le micro pour dicter votre message." : "Le micro n’a pas pu être ouvert.");
    }
  }, [finish, onError]);

  const cancel = useCallback(() => {
    release();
    setState("idle");
  }, [release]);

  useEffect(() => () => void release(), [release]);

  return { state, seconds, level, start, finish, cancel };
}
