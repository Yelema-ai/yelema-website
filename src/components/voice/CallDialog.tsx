"use client";

import { useEffect, useRef } from "react";
import { AudioLines, Loader2, Mic, MicOff, Minimize2, Phone, PhoneCall, PhoneOff, Search, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { HALO_PULSE_MS, HALO_RGB, haloOf, type CallPhase, type Halo } from "@/lib/call-turns";
import type { Caption } from "./useVoiceCall";
import { faceProps, FACE_PX } from "./face";

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export const inCallPhase = (p: CallPhase) => p !== "idle" && p !== "ended" && p !== "unreachable";

const VIOLET = HALO_RGB.parle;
const GREEN = HALO_RGB.ecoute;
const RED = "226,72,72";

/**
 * The call as shown, from its state alone: CallProvider wires it to the live call (Leslie, 23/10, as on
 * the mobile app). On a computer, the expert on the left (picture in its halo, what is happening, the
 * buttons) and what is said on the right, live; on a phone, one under the other.
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
    <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] sm:h-[600px] sm:grid-cols-[344px_minmax(0,1fr)] sm:grid-rows-1">
      <div className="flex flex-col items-center px-6 pb-5 pt-7 text-center sm:border-r sm:border-line sm:pb-6 sm:pt-8">
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

        <div className="mt-auto flex justify-center gap-4 pt-3">
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

      <Transcript captions={p.captions} first={first} speaking={p.phase === "speaking"} connecting={p.phase === "connecting"} onMinimize={p.onMinimize} />
    </div>
  );
}

/** What is happening, in a pill under the picture, in the colour of the halo. */
function Status({ phase, halo, first, reason }: { phase: CallPhase; halo: Halo | null; first: string; reason: string | null }) {
  if (phase === "unreachable") return <p className="max-w-[260px] text-sm text-ko">{reason}</p>;
  if (phase === "ended") return <Pill rgb="150,150,160" ink="text-ink-2" icon={PhoneOff} text="Appel terminé" />;
  if (!halo) return null;
  if (halo === "muet")
    return (
      <>
        <Pill rgb={RED} ink="text-[#C83A3A] dark:text-[#FF8A8A]" icon={MicOff} text="Micro coupé" />
        <p className="max-w-[260px] text-[12.5px] leading-snug text-ink-3">
          {first} ne vous entend pas. Réactivez votre micro pour lui parler.
        </p>
      </>
    );
  if (halo === "ecoute")
    return (
      <>
        <Pill rgb={GREEN} ink="text-[#14915A] dark:text-[#5BDDA0]" icon={Mic} text={`À vous, ${first} écoute`} />
        <span aria-hidden className="flex gap-1.5 pt-1" data-your-turn="">
          {[0, 1, 2].map((k) => (
            <span key={k} className="call-dot size-2 rounded-full bg-[#2EC780]" style={{ animationDelay: `${k * 160}ms` }} />
          ))}
        </span>
      </>
    );
  const ink = "text-[#6A45E0] dark:text-[#B9A2FF]";
  if (halo === "connexion") return <Pill rgb={VIOLET} ink={ink} icon={Loader2} spin text="Connexion…" />;
  if (halo === "reco") return <Pill rgb="150,150,160" ink="text-ink-2" icon={WifiOff} text="Reconnexion…" />;
  if (halo === "cherche") return <Pill rgb={VIOLET} ink={ink} icon={Search} text={`${first} cherche…`} />;
  if (halo === "reflechit") return <Pill rgb={VIOLET} ink={ink} icon={Loader2} spin text={`${first} réfléchit…`} />;
  return <Pill rgb={VIOLET} ink={ink} icon={phase === "speaking" ? AudioLines : PhoneCall} text={`${first} parle`} />;
}

function Pill({ rgb, ink, icon: Icon, text, spin }: { rgb: string; ink: string; icon: typeof Mic; text: string; spin?: boolean }) {
  return (
    <span data-call-status="" className={cn("inline-flex min-h-9 max-w-full items-center gap-2 rounded-full px-4 text-[13px] font-semibold sm:whitespace-nowrap", ink)} style={{ backgroundColor: `rgba(${rgb},0.14)` }}>
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
  const rgb = halo ? HALO_RGB[halo] : null;
  const pulse = halo ? HALO_PULSE_MS[halo] : null;
  const breathe = halo === "parle" || halo === "ecoute";
  const turning = halo === "connexion" || halo === "reflechit";
  const face = photoUrl ? faceProps(photoUrl) : null;
  const size = FACE_PX + MARGIN * 2;
  return (
    <span className="relative grid place-items-center" style={{ width: size, height: size }} data-halo={halo ?? "aucun"}>
      {rgb && (
        <>
          <span
            aria-hidden
            className={cn("call-halo absolute inset-0 rounded-full transition-colors duration-300", breathe && "call-breathe")}
            style={{ backgroundColor: `rgba(${rgb},${halo === "parle" ? 0.22 : 0.14})`, ...(pulse ? { animation: `call-halo ${pulse * 2}ms ease-in-out infinite` } : {}) }}
          />
          {halo === "parle" && <span aria-hidden className="call-breathe absolute rounded-full" style={{ inset: MARGIN / 2, backgroundColor: `rgba(${rgb},0.28)`, animationDelay: "200ms" }} />}
          <span aria-hidden className="absolute rounded-full transition-colors duration-300" style={{ inset: MARGIN - 6, border: `4px solid rgba(${rgb},${halo === "muet" || halo === "reco" ? 1 : 0.95})` }} />
        </>
      )}
      {turning && rgb && (
        <span
          aria-hidden
          className="absolute animate-spin rounded-full border-4 border-transparent motion-reduce:animate-none"
          style={{ inset: MARGIN / 2 - 2, borderTopColor: `rgb(${rgb})`, borderRightColor: `rgb(${rgb})`, animationDuration: "1.2s" }}
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
        {face ? <img {...face} className="size-full object-cover object-[50%_18%]" /> : name.charAt(0)}
      </span>
      {(halo === "cherche" || halo === "muet") && (
        <span
          data-call-badge={halo}
          aria-hidden
          className="absolute grid size-[58px] place-items-center rounded-full text-white ring-4 ring-surface"
          style={{ right: MARGIN - 8, bottom: MARGIN - 8, backgroundColor: halo === "cherche" ? "#7B55F0" : "#E24848" }}
        >
          {halo === "cherche" ? <Search className="size-7" strokeWidth={2.4} /> : <MicOff className="size-7" strokeWidth={2.2} />}
        </span>
      )}
    </span>
  );
}

/** What is said, live: the expert's lines on the left, the member's on the right. */
function Transcript({ captions, first, speaking, connecting, onMinimize }: { captions: Caption[]; first: string; speaking: boolean; connecting: boolean; onMinimize?: () => void }) {
  const end = useRef<HTMLDivElement>(null);
  const count = captions.length;
  const lastText = captions[count - 1]?.text;
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [count, lastText]);
  return (
    <section aria-label="En direct" className="flex min-h-0 flex-col border-t border-line bg-bg/60 sm:rounded-r-[22px] sm:border-t-0">
      <header className="flex h-14 shrink-0 items-center justify-between pl-5 pr-14">
        <h3 className="text-[14px] font-bold">En direct</h3>
        {onMinimize && (
          <button
            type="button"
            onClick={onMinimize}
            aria-label="Réduire l’appel"
            title="Réduire : l’appel continue pendant que vous naviguez"
            className="grid size-10 place-items-center rounded-full border border-line bg-surface text-ink-3 transition-colors hover:bg-soft hover:text-ink"
          >
            <Minimize2 className="size-[17px]" />
          </button>
        )}
      </header>
      <div className="min-h-[140px] flex-1 overflow-y-auto px-5 pb-5" data-call-transcript="">
        {connecting && count === 0 ? (
          <div aria-hidden className="flex h-full flex-col justify-center gap-3">
            <span className="h-2.5 w-3/5 rounded-full bg-soft" />
            <span className="h-2.5 w-1/2 self-end rounded-full bg-soft" />
            <span className="h-2.5 w-2/3 rounded-full bg-soft" />
          </div>
        ) : (
        <div className="flex min-h-full flex-col justify-end gap-3">
          {captions.map((c, k) => {
            const mine = c.who === "member";
            const live = !mine && speaking && k === count - 1;
            return (
              <div key={`${c.at}-${k}`} className={cn("flex max-w-[85%] flex-col gap-1", mine ? "items-end self-end" : "items-start")}>
                <span className={cn("text-[11.5px] font-bold", mine ? "text-[#14915A] dark:text-[#5BDDA0]" : "text-[#6A45E0] dark:text-[#B9A2FF]")}>{mine ? "Vous" : first}</span>
                <p
                  className={cn("rounded-2xl px-3.5 py-2.5 text-[14px] leading-snug text-ink", mine ? "rounded-tr-md" : "rounded-tl-md", live && "ring-2 ring-[#8D68FA]")}
                  style={{ backgroundColor: `rgba(${mine ? GREEN : VIOLET},0.12)` }}
                >
                  {c.text}
                </p>
              </div>
            );
          })}
          <div ref={end} />
        </div>
        )}
      </div>
    </section>
  );
}
