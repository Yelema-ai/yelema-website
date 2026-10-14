"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { VoiceOption } from "@/lib/voice";

// Read once per page: the voices only change when Yelema adds some. Empty where calls are off.
let once: Promise<VoiceOption[]> | null = null;
const load = () =>
  (once ??= apiFetch<{ items: VoiceOption[] }>("/api/voice/voices").then(
    (r) => r.items,
    () => []
  ));

export function useVoices(): VoiceOption[] {
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  useEffect(() => {
    let live = true;
    load().then((v) => live && setVoices(v));
    return () => {
      live = false;
    };
  }, []);
  return voices;
}
