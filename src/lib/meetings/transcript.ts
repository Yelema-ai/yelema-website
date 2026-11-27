import type { TranscriptSegment } from "./bots.ts";

export const TRANSCRIPT_FILE = "transcription.md";

interface Turn {
  speaker: string;
  start: number | null;
  words: string[];
}

const clock = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
};

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

export function speakerTurns(segments: readonly TranscriptSegment[]): Turn[] {
  const turns: Turn[] = [];
  for (const segment of segments) {
    const text = oneLine(segment.text);
    if (!text) continue;
    const speaker = oneLine(segment.speaker) || "Participant";
    const last = turns[turns.length - 1];
    if (last && last.speaker === speaker) last.words.push(text);
    else turns.push({ speaker, start: segment.start, words: [text] });
  }
  return turns;
}

/** Read at the top of the file by the expert who writes the minutes: who said what is not known. */
export const VOICES_NOT_SEPARATED =
  "> Attention : les voix n'ont pas été distinguées (un seul nom pour plusieurs participants). Ne pas attribuer une décision ou une action à une personne sans la confirmer.";

/** Several people took part but every turn carries one speaker name: the attribution cannot be trusted. */
export function voicesNotSeparated(turns: readonly { speaker: string }[], participants: number): boolean {
  return participants >= 2 && turns.length > 0 && new Set(turns.map((t) => t.speaker)).size < 2;
}

export interface TranscriptHeading {
  startedAt: string | null;
  participants: readonly string[];
}

export function transcriptMarkdown(segments: readonly TranscriptSegment[], heading: TranscriptHeading): string {
  const lines = ["# Transcription de la réunion", ""];
  if (heading.startedAt) lines.push(`Début : ${heading.startedAt}`);
  if (heading.participants.length) lines.push(`Participants : ${heading.participants.map(oneLine).join(", ")}`);
  lines.push("");
  const turns = speakerTurns(segments);
  if (voicesNotSeparated(turns, heading.participants.length)) lines.push(VOICES_NOT_SEPARATED, "");
  for (const turn of turns) {
    const at = turn.start === null ? "" : ` (${clock(turn.start)})`;
    lines.push(`**${turn.speaker.replace(/\*/g, "")}**${at} : ${turn.words.join(" ")}`, "");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}
