// What a call looks like on screen, from two audio levels: the member's microphone and the
// expert's voice. Pure: the hook feeds it a reading every few tens of milliseconds.
//
// The voice SDK says nothing of turns, so they are read from the levels, as in the mobile app:
// - the expert talks while its voice is above a threshold, and has finished after a held silence;
// - the member has spoken once their voice held a moment, and has finished after a silence;
// - between the end of the member's sentence and the start of the expert's voice, the expert
//   « réfléchit », for 15 s at most (45 s with « Réfléchis plus longtemps »), then listens again.
// « Laisse-moi finir » keeps the member's pauses from ending their turn.

export type CallPhase = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "reconnecting" | "ended" | "unreachable";

/**
 * The halo around the expert's picture (Leslie, 23/10, as on the mobile app): violet while the expert
 * speaks, picks up, thinks or searches, green when it is the member's turn, grey with a red badge when
 * the microphone is cut. The connection shows the picture in grey with a turning arc.
 */
export type Halo = "parle" | "ecoute" | "reflechit" | "cherche" | "connexion" | "reco" | "muet";

/** The Expert's side is `--call`: Yelema's violet, or the company's color. Green and grey are common. */
export const HALO_COLOR: Record<Halo, string> = {
  parle: "var(--call)",
  ecoute: "#2ec780", // vert
  reflechit: "var(--call)",
  cherche: "var(--call)",
  connexion: "var(--call)",
  reco: "#c9c8d4", // gris, blinks (450 ms)
  muet: "#c9c8d4",
};

/** A color at some opacity, for any CSS color (a variable included). */
export function tint(color: string, alpha: number): string {
  return `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`;
}

/** Half a pulse, in ms; null when the halo stays still. */
export const HALO_PULSE_MS: Record<Halo, number | null> = { parle: null, ecoute: null, reflechit: null, cherche: null, connexion: null, reco: 450, muet: null };

/** Reconnection, then connection, muted, a tool at work, thinking, speaking, listening. */
export function haloOf(phase: CallPhase, muted: boolean, tool = false): Halo | null {
  if (phase === "reconnecting") return "reco";
  if (phase === "connecting") return "connexion";
  if (phase !== "listening" && phase !== "speaking" && phase !== "thinking") return null;
  if (muted) return "muet";
  if (tool && phase !== "speaking") return "cherche";
  if (phase === "thinking") return "reflechit";
  return phase === "speaking" ? "parle" : "ecoute";
}

export const VOICE_ON = 0.02;
export const VOICE_OFF = 0.01;
export const VOICE_START_MS = 120;
export const VOICE_END_MS = 700;
export const MIC_ON = 0.03;
export const MIC_START_MS = 250;
export const MIC_END_MS = 800;
export const THINKING_MAX_MS = 15_000;
export const THINKING_LONGER_MAX_MS = 45_000;

export type TurnPhase = "listening" | "thinking" | "speaking";

export interface TurnState {
  phase: TurnPhase;
  /** When the expert's voice rose, or went quiet; 0 when not. */
  voiceSince: number;
  voiceQuiet: number;
  /** When the member's voice rose, or went quiet; 0 when not. */
  micSince: number;
  micQuiet: number;
  /** The member has said something the expert has not answered yet. */
  memberSpoke: boolean;
  thinkingAt: number;
}

export const firstTurn = (): TurnState => ({ phase: "listening", voiceSince: 0, voiceQuiet: 0, micSince: 0, micQuiet: 0, memberSpoke: false, thinkingAt: 0 });

export interface TurnReading {
  now: number;
  /** The expert's voice level (0 to 1). */
  voice: number;
  /** The member's microphone level (0 to 1); 0 when the microphone is cut. */
  mic: number;
  /** « Laisse-moi finir » is on. */
  holding: boolean;
  /** « Réfléchis plus longtemps » is on. */
  longer: boolean;
}

export function stepTurn(prev: TurnState, r: TurnReading): TurnState {
  const s = { ...prev };
  const { now } = r;

  if (s.phase === "speaking") {
    if (r.voice >= VOICE_OFF) s.voiceQuiet = 0;
    else {
      s.voiceQuiet ||= now;
      if (now - s.voiceQuiet >= VOICE_END_MS) return { ...firstTurn(), phase: "listening" };
    }
    return s;
  }

  // Listening or thinking: the expert's voice starts its turn.
  if (r.voice >= VOICE_ON) {
    s.voiceSince ||= now;
    if (now - s.voiceSince >= VOICE_START_MS) return { ...firstTurn(), phase: "speaking" };
  } else s.voiceSince = 0;

  const talking = r.mic >= MIC_ON;
  if (talking) {
    s.micQuiet = 0;
    s.micSince ||= now;
    if (now - s.micSince >= MIC_START_MS) {
      s.memberSpoke = true;
      // The member speaks again while the expert thinks: back to listening.
      if (s.phase === "thinking") {
        s.phase = "listening";
        s.thinkingAt = 0;
      }
    }
    return s;
  }
  s.micSince = 0;

  if (s.phase === "listening") {
    if (s.memberSpoke && !r.holding) {
      s.micQuiet ||= now;
      if (now - s.micQuiet >= MIC_END_MS) return { ...s, phase: "thinking", thinkingAt: now, memberSpoke: false, micQuiet: 0 };
    } else s.micQuiet = 0;
    return s;
  }

  // Thinking, in silence: not forever.
  if (now - s.thinkingAt >= (r.longer ? THINKING_LONGER_MAX_MS : THINKING_MAX_MS)) return { ...firstTurn(), phase: "listening" };
  return s;
}

/** Root mean square of a waveform (Web Audio time-domain samples, -1 to 1). */
export function rms(samples: ArrayLike<number>): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}
