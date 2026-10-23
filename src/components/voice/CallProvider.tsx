"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import { Maximize2, Mic, MicOff, PhoneOff } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useExpertsContext } from "@/components/experts/ExpertsProvider";
import { HALO_RGB, haloOf } from "@/lib/call-turns";
import { agentTabPath } from "@/lib/expert-tabs";
import { chosenVoice, type VoiceOption } from "@/lib/voice";
import { useVoiceExpert } from "./useVoiceExpert";
import { loadVoicePrefs } from "@/lib/voice-prefs";
import { cn } from "@/lib/utils";
import { CallView, inCallPhase } from "./CallDialog";
import { faceProps } from "./face";
import { useRingback } from "./useRingback";
import { demoCallEnabled, useDemoCall } from "./useDemoCall";
import { useVoiceCall } from "./useVoiceCall";

// The call with an expert lives here, above the pages (AppShell), so it goes on while the member
// moves through the app: the window folds into a mini window (bottom right on a computer, a compact
// strip under the top bar on a phone) and opens again. When the call ends, the end tone, the window
// closes by itself after a moment and a toast offers the call's page (its summary, as in Fireflies).

type Callee = { key: string; name: string; photoUrl: string | null };
type View = "full" | "mini";

interface CallContextValue {
  /** Calls this expert; a call already under way is shown instead. */
  call(expert: Callee, voices: VoiceOption[]): void;
  /** The folded call for the phone's strip (CallStrip), null when there is none. */
  strip: React.ReactNode;
  /** A call holds the microphone: dictation stands aside. */
  active: boolean;
  /** The mini window floats bottom right on a computer: the Yélé bubble moves above it. */
  folded: boolean;
}

const CallContext = createContext<CallContextValue | null>(null);

export function useCall(): CallContextValue {
  const c = useContext(CallContext);
  if (!c) throw new Error("useCall outside CallProvider");
  return c;
}

/** Outside the app's shell (no CallProvider) there is never a call. */
export function useCallState(): { active: boolean; folded: boolean } {
  const c = useContext(CallContext);
  return { active: c?.active ?? false, folded: c?.folded ?? false };
}

const CLOSE_AFTER_MS = 1500;

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const duration = (s: number) => (s < 60 ? `${s} s` : `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ""}`);

const PHASE_SHORT: Record<string, string> = {
  connecting: "Appel en cours…",
  listening: "À vous",
  thinking: "Réfléchit…",
  speaking: "Parle",
  reconnecting: "Reconnexion…",
};

export function CallProvider({ children }: { children: React.ReactNode }) {
  const real = useVoiceCall();
  const demo = useDemoCall();
  // Development only, and only once asked for (useDemoCall.ts): production never takes the demo.
  const [useDemo, setUseDemo] = useState(false);
  const live = useDemo ? demo : real;
  const [expert, setExpert] = useState<Callee | null>(null);
  const [view, setView] = useState<View | null>(null);
  const voice = useRef<VoiceOption | null>(null);
  const voicesRef = useRef<VoiceOption[]>([]);
  const router = useRouter();
  const { experts } = useExpertsContext();
  const voiceExpert = useVoiceExpert();
  const inCall = inCallPhase(live.phase);
  useRingback(view !== null && live.phase === "connecting");

  const dial = useCallback(
    async (who: Callee) => {
      const demoOn = demoCallEnabled();
      setUseDemo(demoOn);
      const prefs = await loadVoicePrefs(who.key);
      voice.current = chosenVoice(voicesRef.current, prefs, voiceExpert(who.key));
      (demoOn ? demo : real).start({ expert: who.key, language: prefs.language, voice: voice.current?.key ?? null });
    },
    [demo, real, voiceExpert]
  );

  const call = useCallback<CallContextValue["call"]>(
    (who, voices) => {
      if (inCall) {
        setView("full");
        return;
      }
      voicesRef.current = voices;
      setExpert(who);
      setView("full");
      void dial(who);
    },
    [dial, inCall]
  );

  // The call's page, newest call first in the expert's « Appels ».
  const known = useMemo(() => (expert ? (experts.find((x) => x.catalogueKey === expert.key) ?? null) : null), [expert, experts]);
  const callsPath = known ? `${agentTabPath(known.agentId, "calls", known.profileId)}?appel=dernier` : null;
  const role = known?.role ?? null;

  // Hung up by either side: the window goes by itself, a toast keeps the way to the summary.
  const answeredFor = useRef(0);
  if (inCall && live.elapsed > 0) answeredFor.current = live.elapsed;
  useEffect(() => {
    if (live.phase !== "ended" || !expert) return;
    const seconds = answeredFor.current;
    const name = expert.name;
    const path = callsPath;
    const t = setTimeout(() => {
      setView(null);
      answeredFor.current = 0;
      if (seconds > 0) {
        toast(`Appel terminé avec ${name}`, {
          description: `Durée : ${duration(seconds)}`,
          // eslint-disable-next-line @next/next/no-img-element
          icon: expert.photoUrl ? <img src={expert.photoUrl} alt="" className="toast-face" /> : undefined,
          action: path ? { label: "Voir le résumé", onClick: () => router.push(path) } : undefined,
          duration: 10000,
        });
      }
    }, CLOSE_AFTER_MS);
    return () => clearTimeout(t);
  }, [live.phase, expert, callsPath, router]);

  const closeFull = (next: boolean) => {
    if (next) return;
    if (inCall) live.hangUp();
    setView(null);
  };

  const mini =
    expert && view === "mini"
      ? (variant: "strip" | "float") => (
          <MiniCall
            variant={variant}
            expert={expert}
            phase={live.phase}
            muted={live.muted}
            tool={live.tool}
            elapsed={live.elapsed}
            onMute={() => live.setMuted(!live.muted)}
            onHangUp={live.hangUp}
            onExpand={() => setView("full")}
          />
        )
      : null;
  const strip = mini ? mini("strip") : null;
  const folded = mini !== null;
  const value = useMemo(() => ({ call, strip, active: inCall, folded }), [call, strip, inCall, folded]);

  return (
    <CallContext.Provider value={value}>
      {children}
      {expert && (
        <Dialog open={view === "full"} onOpenChange={closeFull}>
          <DialogContent
            className="gap-0 overflow-hidden p-0 max-sm:inset-0 max-sm:h-[100dvh] max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-0 sm:max-w-[920px]"
            onOpenAutoFocus={(e) => e.preventDefault()}
            onInteractOutside={(e) => inCall && e.preventDefault()}
          >
            <CallView
              name={expert.name}
              role={role}
              photoUrl={expert.photoUrl}
              phase={live.phase}
              reason={live.reason}
              muted={live.muted}
              tool={live.tool}
              captions={live.captions}
              elapsed={live.elapsed}
              onMute={() => live.setMuted(!live.muted)}
              onHangUp={live.hangUp}
              onMinimize={inCall ? () => setView("mini") : undefined}
              onClose={() => setView(null)}
              onRedial={() => void dial(expert)}
            />
          </DialogContent>
        </Dialog>
      )}
      {mini?.("float")}
    </CallContext.Provider>
  );
}

/** Where the phone shows the folded call: in the page's flow, under the top bar, so it hides nothing. */
export function CallStrip() {
  const { strip } = useCall();
  return strip;
}

/**
 * The call folded: the expert's face in its halo, name, time, microphone, hang up, open again. On a
 * computer it floats bottom right and can be dragged; on a phone it is a strip under the top bar,
 * clear of the menu and of the chat's composer.
 */
function MiniCall(p: {
  variant: "strip" | "float";
  expert: Callee;
  phase: Parameters<typeof haloOf>[0];
  muted: boolean;
  tool: boolean;
  elapsed: number;
  onMute: () => void;
  onHangUp: () => void;
  onExpand: () => void;
}) {
  const halo = haloOf(p.phase, p.muted, p.tool);
  const rgb = halo ? HALO_RGB[halo] : null;
  const face = p.expert.photoUrl ? faceProps(p.expert.photoUrl) : null;
  const ended = !inCallPhase(p.phase);
  const status = ended ? "Appel terminé" : halo === "muet" ? "Micro coupé" : halo === "cherche" ? "Cherche…" : (PHASE_SHORT[p.phase] ?? "");
  const timed = p.phase === "listening" || p.phase === "speaking" || p.phase === "thinking" || p.phase === "reconnecting" || (ended && p.elapsed > 0);

  // Dragged on a computer: an offset from the bottom-right corner, kept inside the window.
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button") || window.matchMedia("(max-width: 639px)").matches) return;
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const box = e.currentTarget.getBoundingClientRect();
    const maxX = window.innerWidth - box.width - 48;
    const maxY = window.innerHeight - box.height - 48;
    setOffset({
      x: Math.min(maxX, Math.max(-24, d.ox - (e.clientX - d.x))),
      y: Math.min(maxY, Math.max(-24, d.oy - (e.clientY - d.y))),
    });
  };
  const end = () => {
    drag.current = null;
  };

  return (
    <div
      role="region"
      aria-label={`Appel avec ${p.expert.name}`}
      data-mini-call=""
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      style={{ "--mx": `${offset.x}px`, "--my": `${offset.y}px` } as React.CSSProperties}
      className={cn(
        "flex items-center gap-3 border-line bg-surface text-ink",
        p.variant === "strip"
          ? // Phone: a strip in the flow, under the top bar.
            "sticky top-[62px] z-20 shrink-0 border-b px-4 py-2 sm:hidden"
          : // Computer: a card bottom right, draggable.
            "fixed z-50 max-sm:hidden right-[calc(24px+var(--mx))] bottom-[calc(24px+var(--my))] w-[320px] cursor-grab touch-none rounded-[22px] border px-3.5 py-3 shadow-[0_12px_40px_rgb(48_22_103/0.22)] active:cursor-grabbing dark:shadow-[0_12px_40px_rgb(0_0_0/0.5)]"
      )}
    >
      <span className="relative grid size-11 shrink-0 place-items-center sm:size-12" data-halo={halo ?? "aucun"}>
        {rgb && <span aria-hidden className="absolute -inset-[3px] rounded-full transition-colors duration-300" style={{ backgroundColor: `rgba(${rgb},0.9)`, boxShadow: `0 0 14px rgba(${rgb},0.7)` }} />}
        <span className="relative grid size-full place-items-center overflow-hidden rounded-full bg-tint text-base font-bold text-brand-ink ring-2 ring-surface">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {face ? <img {...face} className="size-full object-cover object-[50%_18%]" /> : p.expert.name.charAt(0)}
        </span>
      </span>
      <span className="min-w-0 flex-1" aria-live="polite">
        <span className="block truncate text-sm font-bold leading-tight">{p.expert.name}</span>
        <span className="block truncate text-[12px] text-ink-3">
          {status}
          {timed && `, ${clock(p.elapsed)}`}
        </span>
      </span>
      {!ended && (
        <button
          type="button"
          onClick={p.onMute}
          aria-pressed={p.muted}
          aria-label={p.muted ? "Réactiver le micro" : "Couper le micro"}
          className="grid size-11 shrink-0 place-items-center rounded-full border border-line text-ink-2 hover:bg-soft"
        >
          {p.muted ? <MicOff className="size-[18px]" /> : <Mic className="size-[18px]" />}
        </button>
      )}
      {!ended && (
        <button type="button" onClick={p.onHangUp} aria-label="Raccrocher" className="grid size-11 shrink-0 place-items-center rounded-full bg-destructive text-destructive-foreground hover:opacity-90">
          <PhoneOff className="size-[18px]" />
        </button>
      )}
      <button type="button" onClick={p.onExpand} aria-label="Agrandir l’appel" className="grid size-11 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-soft">
        <Maximize2 className="size-[18px]" />
      </button>
    </div>
  );
}
