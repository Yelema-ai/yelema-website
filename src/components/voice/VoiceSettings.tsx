"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { chosenVoice, VOICE_LANGUAGES, type VoiceOption, type VoicePrefs } from "@/lib/voice";

/** Language and voice of the user's calls, chosen ahead so "Appeler" calls at once. */
export function VoiceSettings({ voices, prefs, onChange }: { voices: VoiceOption[]; prefs: VoicePrefs; onChange: (prefs: VoicePrefs) => void }) {
  const chosen = chosenVoice(voices, prefs);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1 rounded-xl bg-soft p-1">
        {VOICE_LANGUAGES.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => onChange({ ...prefs, language: l.id })}
            className={cn("flex-1 rounded-[10px] py-1.5 text-[13px] font-semibold", prefs.language === l.id ? "bg-surface text-ink shadow-sm" : "text-ink-2")}
          >
            {l.label}
          </button>
        ))}
      </div>
      <VoicePicker
        voices={voices.filter((v) => v.language === prefs.language)}
        value={chosen?.key ?? null}
        onChange={(key) => onChange({ ...prefs, voices: { ...prefs.voices, [prefs.language]: key } })}
      />
    </div>
  );
}

/** The voices of one language, each with its sample. */
function VoicePicker({ voices, value, onChange }: { voices: VoiceOption[]; value: string | null; onChange: (key: string) => void }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  useEffect(() => () => audio.current?.pause(), []);
  const listen = (v: VoiceOption) => {
    audio.current?.pause();
    if (playing === v.key) return setPlaying(null);
    const a = new Audio(v.previewUrl);
    a.onended = () => setPlaying(null);
    audio.current = a;
    setPlaying(v.key);
    a.play().catch(() => setPlaying(null));
  };
  return (
    <div className="max-h-56 overflow-y-auto rounded-xl border border-line">
      {voices.map((v) => (
        <div key={v.key} className={cn("flex items-center gap-2 border-b border-line px-3 py-2 last:border-b-0", value === v.key && "bg-tint")}>
          <button type="button" onClick={() => onChange(v.key)} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-pressed={value === v.key}>
            <span className={cn("size-3.5 shrink-0 rounded-full border-2", value === v.key ? "border-brand bg-brand" : "border-line")} />
            <span className="truncate text-sm font-semibold text-ink">{v.label}</span>
            <span className="text-[11px] text-ink-3">{v.gender === "female" ? "Femme" : v.gender === "male" ? "Homme" : "Neutre"}</span>
          </button>
          <button type="button" onClick={() => listen(v)} className="rounded-full p-1.5 text-ink-2 hover:bg-soft" aria-label={`Écouter ${v.label}`}>
            {playing === v.key ? <Pause className="size-4" /> : <Play className="size-4" />}
          </button>
        </div>
      ))}
    </div>
  );
}
