// Voice calls with an expert. The back office opens the call at Aethex and picks the agent; this app
// relays the signaling with the member's session (src/app/api/voice) and plays the audio in the browser.

export type VoiceLanguage = "fr" | "en";

export interface VoiceOption {
  key: string;
  label: string;
  language: VoiceLanguage;
  gender: "female" | "male" | "neutral";
  country: string;
  /** Public sample, playable without a key. */
  previewUrl: string;
  /** The voice a call in this language takes when none is chosen. */
  default: boolean;
}

export const VOICE_LANGUAGES: { id: VoiceLanguage; label: string }[] = [
  { id: "fr", label: "Français" },
  { id: "en", label: "Anglais" },
];

/** Signaling steps the SDK sends after `calls`, with the one method each takes. */
export const SIGNALING_METHOD = { offer: "POST", ice: "PATCH", status: "GET", end: "POST", feedback: "POST" } as const;
export type SignalingStep = keyof typeof SIGNALING_METHOD;

const CONVERSATION_ID = /^[A-Za-z0-9_-]{1,128}$/;
const KEY = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** The step a relayed request names, or null when the path or the method is not one the SDK sends. */
export function signalingStep(id: string, action: string, method: string): SignalingStep | null {
  if (!CONVERSATION_ID.test(id) || !Object.hasOwn(SIGNALING_METHOD, action)) return null;
  const step = action as SignalingStep;
  return SIGNALING_METHOD[step] === method ? step : null;
}

/** The `X-Yelema-*` headers of a call, kept only when well-formed; the back office checks them again. */
export function callHeaders(h: Headers): Record<string, string> | null {
  const expert = h.get("x-yelema-expert")?.trim().toLowerCase() ?? "";
  const language = h.get("x-yelema-language")?.trim().toLowerCase() ?? "";
  const voice = h.get("x-yelema-voice")?.trim().toLowerCase() ?? "";
  if (!KEY.test(expert) || !VOICE_LANGUAGES.some((l) => l.id === language)) return null;
  if (voice && !KEY.test(voice)) return null;
  return { "X-Yelema-Expert": expert, "X-Yelema-Language": language, ...(voice ? { "X-Yelema-Voice": voice } : {}) };
}

// ---- The member's choice, kept in this browser ---------------------------------------------------

export interface VoicePrefs {
  language: VoiceLanguage;
  /** Chosen voice per language; absent: the language's default. */
  voices: Partial<Record<VoiceLanguage, string>>;
}

// One setting per expert (its catalogue key); an expert not set yet takes what was chosen for all
// of them before, in "Mon profil" (the bare key), else French and its default voice.
const PREFS_KEY = "yelema-voice";

export function parseVoicePrefs(raw: string | null): VoicePrefs | null {
  try {
    const v = JSON.parse(raw ?? "null") as Partial<VoicePrefs> | null;
    if (!v || typeof v !== "object") return null;
    return { language: v.language === "en" ? "en" : "fr", voices: v.voices && typeof v.voices === "object" ? v.voices : {} };
  } catch {
    return null;
  }
}

export function readVoicePrefs(expert: string): VoicePrefs {
  try {
    return parseVoicePrefs(localStorage.getItem(`${PREFS_KEY}:${expert}`)) ?? parseVoicePrefs(localStorage.getItem(PREFS_KEY)) ?? { language: "fr", voices: {} };
  } catch {
    return { language: "fr", voices: {} };
  }
}

export function writeVoicePrefs(expert: string, prefs: VoicePrefs): void {
  try {
    localStorage.setItem(`${PREFS_KEY}:${expert}`, JSON.stringify(prefs));
  } catch {}
}

/** The voice a call takes: the one chosen for the language, else its default, else its first. */
export function chosenVoice(voices: VoiceOption[], prefs: VoicePrefs): VoiceOption | null {
  const ofLanguage = voices.filter((v) => v.language === prefs.language);
  return ofLanguage.find((v) => v.key === prefs.voices[prefs.language]) ?? ofLanguage.find((v) => v.default) ?? ofLanguage[0] ?? null;
}
