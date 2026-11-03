"use client";

import { useEffect, useState } from "react";
import { AudioLines, Loader2, Mic, MicOff, Minimize2, Phone, PhoneCall, PhoneOff, Search, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { HALO_COLOR, HALO_PULSE_MS, haloOf, tint, type CallPhase, type Halo } from "@/lib/call-turns";
import type { Caption } from "./useVoiceCall";
import { faceProps, FACE_PX } from "./face";

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export const inCallPhase = (p: CallPhase) => p !== "idle" && p !== "ended" && p !== "unreachable";

const VIOLET = HALO_COLOR.parle;
const GREEN = HALO_COLOR.ecoute;
const RED = "#e24848";
const GREY = "#9696a0";

/**
 * The call as shown, from its state alone: CallProvider wires it to the live call (Leslie, 23/10, as on
 * the mobile app). One column, the expert in the middle: picture in its halo, what is happening, the
 * expert's last sentence under it, the buttons. What the member says never shows: its live
 * transcription is not reliable enough (Leslie, 26/10).
 */
export function CallView(p: {
  name: string;
  role: string | null;
  photoUrl: string | null;
  phase: CallPhase;
  reason: string | null;
  muted: boolean;
  tool: boolean;
  captions: Caption[];
  elapsed: number;
  onMute: () => void;
  onHangUp: () => void;
  /** Folds the window into the mini window; absent when there is no call to keep. */
  onMinimize?: () => void;
  onClose: () => void;
  onRedial: () => void;
}) {
  const inCall = inCallPhase(p.phase);
  const halo = haloOf(p.phase, p.muted, p.tool);
  const timed = p.phase === "listening" || p.phase === "speaking" || p.phase === "thinking" || p.phase === "reconnecting" || (p.phase === "ended" && p.elapsed > 0);
  const first = p.name.split(" ")[0];
  return (
    <div className="relative flex min-h-0 flex-col max-sm:h-full sm:min-h-[600px]">
      {p.onMinimize && (
        <button
          type="button"
          onClick={p.onMinimize}
          aria-label="Réduire l’appel"
          title="Réduire : l’appel continue pendant que vous naviguez"
          className="absolute left-3 top-3 z-10 grid size-11 place-items-center rounded-full border border-line bg-surface text-ink-3 transition-colors hover:bg-soft hover:text-ink"
        >
          <Minimize2 className="size-[17px]" />
        </button>
      )}
      <div className="flex flex-1 flex-col items-center px-6 pb-6 pt-8 text-center">
        <DialogTitle className="font-display text-[22px] font-bold leading-tight">{p.name}</DialogTitle>
        {p.role && <p className="mt-0.5 text-[13px] text-ink-3">{p.role}</p>}
        <p className="mt-0.5 h-4 text-[12px] tabular-nums text-ink-3">{timed || p.phase === "connecting" ? clock(p.elapsed) : ""}</p>

        <div className="mt-4 sm:mt-7">
          <Portrait photoUrl={p.photoUrl} name={p.name} halo={halo} />
        </div>

        <DialogDescription asChild>
          <div aria-live="polite" className="mt-4 flex min-h-[64px] flex-col items-center gap-1.5 sm:mt-6">
            <Status phase={p.phase} halo={halo} first={first} reason={p.reason} />
          </div>
        </DialogDescription>

        {inCall && <Subtitle captions={p.captions} speaking={p.phase === "speaking"} />}

        <div className="mt-auto flex justify-center gap-4 pt-6">
          {inCall ? (
            <>
              <button
                type="button"
                onClick={p.onMute}
                aria-label={p.muted ? "Réactiver le micro" : "Couper le micro"}
                aria-pressed={p.muted}
                className={cn(
                  "grid size-14 place-items-center rounded-full border transition-colors",
                  p.muted ? "border-ink bg-ink text-bg" : "border-line bg-surface text-ink hover:bg-soft"
                )}
              >
                {p.muted ? <MicOff className="size-6" /> : <Mic className="size-6" />}
              </button>
              <button type="button" onClick={p.onHangUp} aria-label="Raccrocher" className="grid size-14 place-items-center rounded-full bg-[#E24848] text-white transition-opacity hover:opacity-90">
                <PhoneOff className="size-6" />
              </button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={p.onClose}>
                Fermer
              </Button>
              <Button onClick={p.onRedial}>
                <Phone />
                Rappeler
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** What is happening, in a pill under the picture, in the colour of the halo. */
function Status({ phase, halo, first, reason }: { phase: CallPhase; halo: Halo | null; first: string; reason: string | null }) {
  if (phase === "unreachable") return <p className="max-w-[260px] text-sm text-ko">{reason}</p>;
  if (phase === "ended") return <Pill color={GREY} ink="text-ink-2" icon={PhoneOff} text="Appel terminé" />;
  if (!halo) return null;
  if (halo === "muet")
    return (
      <>
        <Pill color={RED} ink="text-[#C83A3A] dark:text-[#FF8A8A]" icon={MicOff} text="Micro coupé" />
        <p className="max-w-[260px] text-[12.5px] leading-snug text-ink-3">
          {first} ne vous entend pas. Réactivez votre micro pour lui parler.
        </p>
      </>
    );
  if (halo === "ecoute")
    return (
      <>
        <Pill color={GREEN} ink="text-[#14915A] dark:text-[#5BDDA0]" icon={Mic} text={`À vous, ${first} écoute`} />
        <span aria-hidden className="flex gap-1.5 pt-1" data-your-turn="">
          {[0, 1, 2].map((k) => (
            <span key={k} className="call-dot size-2 rounded-full bg-[#2EC780]" style={{ animationDelay: `${k * 160}ms` }} />
          ))}
        </span>
      </>
    );
  const ink = "text-[var(--call-ink)]";
  if (halo === "connexion") return <Pill color={VIOLET} ink={ink} icon={Loader2} spin text="Connexion…" />;
  if (halo === "reco") return <Pill color={GREY} ink="text-ink-2" icon={WifiOff} text="Reconnexion…" />;
  if (halo === "cherche") return <Pill color={VIOLET} ink={ink} icon={Search} text={`${first} cherche…`} />;
  if (halo === "reflechit") return <Pill color={VIOLET} ink={ink} icon={Loader2} spin text={`${first} réfléchit…`} />;
  return <Pill color={VIOLET} ink={ink} icon={phase === "speaking" ? AudioLines : PhoneCall} text={`${first} parle`} />;
}

function Pill({ color, ink, icon: Icon, text, spin }: { color: string; ink: string; icon: typeof Mic; text: string; spin?: boolean }) {
  return (
    <span data-call-status="" className={cn("inline-flex min-h-9 max-w-full items-center gap-2 rounded-full px-4 text-[13px] font-semibold sm:whitespace-nowrap", ink)} style={{ backgroundColor: tint(color, 0.14) }}>
      <Icon className={cn("size-4 shrink-0", spin && "animate-spin motion-reduce:animate-none")} strokeWidth={2} />
      {text}
    </span>
  );
}

// The expert in large, in a halo of the moment's colour (src/lib/call-turns.ts): it breathes while the
// expert speaks or listens, the picture is grey with a turning arc while the call connects, a loupe
// shows a search and a red badge the microphone cut.
const MARGIN = 34;

function Portrait({ photoUrl, name, halo }: { photoUrl: string | null; name: string; halo: Halo | null }) {
  const color = halo ? HALO_COLOR[halo] : null;
  const pulse = halo ? HALO_PULSE_MS[halo] : null;
  const breathe = halo === "parle" || halo === "ecoute";
  const turning = halo === "connexion" || halo === "reflechit";
  const face = photoUrl ? faceProps(photoUrl) : null;
  const size = FACE_PX + MARGIN * 2;
  return (
    <span className="relative grid place-items-center" style={{ width: size, height: size }} data-halo={halo ?? "aucun"}>
      {color && (
        <>
          <span
            aria-hidden
            className={cn("call-halo absolute inset-0 rounded-full transition-colors duration-300", breathe && "call-breathe")}
            style={{ backgroundColor: tint(color, halo === "parle" ? 0.22 : 0.14), ...(pulse ? { animation: `call-halo ${pulse * 2}ms ease-in-out infinite` } : {}) }}
          />
          {halo === "parle" && <span aria-hidden className="call-breathe absolute rounded-full" style={{ inset: MARGIN / 2, backgroundColor: tint(color, 0.28), animationDelay: "200ms" }} />}
          <span aria-hidden className="absolute rounded-full transition-colors duration-300" style={{ inset: MARGIN - 6, border: `4px solid ${tint(color, halo === "muet" || halo === "reco" ? 1 : 0.95)}` }} />
        </>
      )}
      {turning && color && (
        <span
          aria-hidden
          className="absolute animate-spin rounded-full border-4 border-transparent motion-reduce:animate-none"
          style={{ inset: MARGIN / 2 - 2, borderTopColor: color, borderRightColor: color, animationDuration: "1.2s" }}
        />
      )}
      <span
        className={cn(
          "relative grid place-items-center overflow-hidden rounded-full bg-tint text-5xl font-bold text-brand-ink transition-[filter] duration-300",
          (halo === "connexion" || halo === "reco") && "grayscale",
          halo === "reco" && "brightness-75"
        )}
        style={{ width: FACE_PX, height: FACE_PX }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {face ? <img {...face} className={photoUrl?.startsWith("/yele/") ? "size-[78%] object-contain" : "size-full object-cover object-[50%_18%]"} /> : name.charAt(0)}
      </span>
      {(halo === "cherche" || halo === "muet") && (
        <span
          data-call-badge={halo}
          aria-hidden
          className="absolute grid size-[58px] place-items-center rounded-full text-white ring-4 ring-surface"
          style={{ right: MARGIN - 8, bottom: MARGIN - 8, backgroundColor: halo === "cherche" ? VIOLET : RED }}
        >
          {halo === "cherche" ? <Search className="size-7" strokeWidth={2.4} /> : <MicOff className="size-7" strokeWidth={2.2} />}
        </span>
      )}
    </span>
  );
}

// A French voice at an even pace, about 160 words a minute.
const WORD_MS = 370;

/**
 * The expert's last sentence, under the halo, without its name (Leslie, 26/10). Aethex sends it whole
 * before saying it: it is written word by word at the voice's pace while the expert speaks, the next
 * word greyed, and shown whole once it stops. The member's lines are left out.
 */
function Subtitle({ captions, speaking }: { captions: Caption[]; speaking: boolean }) {
  const lines = captions.filter((c) => c.who === "expert");
  const words = (lines.at(-1)?.text ?? "").split(/\s+/).filter(Boolean);
  const [n, setN] = useState(0);
  useEffect(() => setN(0), [lines.length]);
  useEffect(() => {
    if (!speaking) return setN(words.length);
    if (n >= words.length) return;
    const t = setTimeout(() => setN((k) => k + 1), WORD_MS);
    return () => clearTimeout(t);
  }, [n, words.length, speaking]);
  const said = words.slice(0, n).join(" ");
  const next = words[n];
  return (
    <p
      data-call-subtitle=""
      className={cn(
        "mt-4 line-clamp-4 min-h-[66px] max-w-[460px] text-balance leading-snug transition-colors",
        speaking ? "text-[16px] text-ink" : "text-[14px] text-ink-3"
      )}
    >
      <span className="sr-only" aria-live="polite">
        {words.join(" ")}
      </span>
      <span aria-hidden>
        {said}
        {next && <span className="text-ink-3/50">{`${said ? " " : ""}${next}`}</span>}
      </span>
    </p>
  );
}
