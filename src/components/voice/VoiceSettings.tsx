"use client";

import { useEffect, useRef, useState } from "react";
import { AudioLines, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  chosenVoice,
  countryFlag,
  expertDefaultVoice,
  countryName,
  filterVoices,
  sortVoices,
  voiceFacets,
  VOICE_LANGUAGES,
  type VoiceExpert,
  type VoiceFilter,
  type VoiceOption,
  type VoicePrefs,
} from "@/lib/voice";

const ALL: VoiceFilter = { gender: null, country: null };
const GENDER_LABEL = { female: "Femme", male: "Homme", neutral: "Neutre" } as const;

/** Language and voice of the user's calls, chosen ahead so "Appeler" calls at once. */
export function VoiceSettings({
  voices,
  prefs,
  onChange,
  expert,
}: {
  voices: VoiceOption[];
  prefs: VoicePrefs;
  onChange: (prefs: VoicePrefs) => void;
  /** The Expert whose own default voice is shown chosen until another is picked. */
  expert?: VoiceExpert;
}) {
  const [filter, setFilter] = useState<VoiceFilter>(ALL);
  const chosen = chosenVoice(voices, prefs, expert);
  const ofLanguage = voices.filter((v) => v.language === prefs.language);
  const facets = voiceFacets(ofLanguage, filter);
  // The voice the Expert takes when nobody chose one: named « par défaut », shown before any change.
  const fallback = expertDefaultVoice(voices, prefs.language, expert) ?? ofLanguage.find((v) => v.default) ?? null;
  const isDefault = Boolean(chosen && fallback && chosen.key === fallback.key);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {chosen && (
        <div className="flex items-center gap-3 rounded-xl border border-brand/30 bg-tint px-3 py-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand text-on-brand">
            <AudioLines className="size-4" />
          </span>
          <span className="min-w-0 grow">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-3">{isDefault ? "Sa voix par défaut" : "Sa voix"}</span>
            <span className="block truncate text-sm font-semibold text-ink">
              {chosen.label}{" "}
              <span className="font-normal text-ink-3">
                {GENDER_LABEL[chosen.gender]}, {countryFlag(chosen.country)} {countryName(chosen.country)}
              </span>
            </span>
          </span>
        </div>
      )}
      <div className="flex gap-1 rounded-xl bg-soft p-1">
        {VOICE_LANGUAGES.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => (setFilter(ALL), onChange({ ...prefs, language: l.id }))}
            className={cn("flex-1 rounded-[10px] py-1.5 text-[13px] font-semibold", prefs.language === l.id ? "bg-surface text-ink shadow-sm" : "text-ink-2")}
          >
            {l.label}
          </button>
        ))}
      </div>
      <Chips
        label="Genre"
        options={facets.genders.map((g) => ({ id: g, text: GENDER_LABEL[g] }))}
        value={filter.gender}
        onChange={(gender) => setFilter({ ...filter, gender })}
      />
      {facets.countries.length > 1 || filter.country ? (
        <Chips
          label="Pays"
          options={facets.countries.map((c) => ({ id: c, text: `${countryFlag(c)} ${countryName(c)}` }))}
          value={filter.country}
          onChange={(country) => setFilter({ ...filter, country })}
        />
      ) : null}
      <VoicePicker
        voices={sortVoices(filterVoices(ofLanguage, filter))}
        value={chosen?.key ?? null}
        defaultKey={fallback?.key ?? null}
        onChange={(key) => onChange({ ...prefs, voices: { ...prefs.voices, [prefs.language]: key } })}
      />
    </div>
  );
}

/** One filter row: "Tous" plus the values still on offer. */
function Chips<T extends string>({ label, options, value, onChange }: { label: string; options: { id: T; text: string }[]; value: T | null; onChange: (v: T | null) => void }) {
  const chip = (active: boolean) => cn("shrink-0 rounded-full border px-2.5 py-1 text-[12px] font-semibold", active ? "border-brand bg-tint text-ink" : "border-line text-ink-2 hover:bg-soft");
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(null)} className={chip(value === null)} aria-pressed={value === null}>
        Tous
      </button>
      {options.map((o) => (
        <button key={o.id} type="button" onClick={() => onChange(value === o.id ? null : o.id)} className={chip(value === o.id)} aria-pressed={value === o.id}>
          {o.text}
        </button>
      ))}
    </div>
  );
}

/** The voices of one language, each with its sample. */
function VoicePicker({ voices, value, defaultKey, onChange }: { voices: VoiceOption[]; value: string | null; defaultKey: string | null; onChange: (key: string) => void }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const list = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  useEffect(() => () => audio.current?.pause(), []);
  // The chosen voice in sight on opening, even far down the list.
  useEffect(() => {
    list.current?.querySelector<HTMLElement>("[aria-pressed=true]")?.scrollIntoView({ block: "nearest" });
  }, [value]);
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
    <div ref={list} className="max-h-56 overflow-y-auto rounded-xl border border-line">
      {voices.map((v) => (
        <div key={v.key} className={cn("flex items-center gap-2 border-b border-line px-3 py-2 last:border-b-0", value === v.key && "bg-tint")}>
          <button type="button" onClick={() => onChange(v.key)} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-pressed={value === v.key}>
            <span className={cn("size-3.5 shrink-0 rounded-full border-2", value === v.key ? "border-brand bg-brand" : "border-line")} />
            <span className="truncate text-sm font-semibold text-ink">{v.label}</span>
            {v.key === defaultKey && <span className="shrink-0 rounded-full bg-soft px-1.5 py-0.5 text-[10.5px] font-semibold text-ink-2">par défaut</span>}
            <span className="shrink-0 text-[11px] text-ink-3">
              {GENDER_LABEL[v.gender]} · <span title={countryName(v.country)}>{countryFlag(v.country)} {countryName(v.country)}</span>
            </span>
          </button>
          <button type="button" onClick={() => listen(v)} className="rounded-full p-1.5 text-ink-2 hover:bg-soft" aria-label={`Écouter ${v.label}`}>
            {playing === v.key ? <Pause className="size-4" /> : <Play className="size-4" />}
          </button>
        </div>
      ))}
    </div>
  );
}
