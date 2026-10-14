"use client";

import { useEffect, useRef } from "react";
import { Mic, MicOff, Phone, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { chosenVoice, readVoicePrefs, type VoiceOption } from "@/lib/voice";
import { useRingback } from "./useRingback";
import { useVoiceCall, type CallPhase } from "./useVoiceCall";

const PHASE_LABEL: Record<CallPhase, string> = {
  idle: "",
  connecting: "Appel en cours…",
  listening: "Vous écoute",
  speaking: "Parle",
  reconnecting: "Reconnexion…",
  ended: "Appel terminé",
  unreachable: "Injoignable",
};

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Opening it calls at once, in the language and voice chosen ahead for this expert. */
export function CallDialog({
  open,
  onOpenChange,
  expert,
  voices,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expert: { key: string; name: string; photoUrl: string | null };
  voices: VoiceOption[];
}) {
  const call = useVoiceCall();
  const voice = useRef<VoiceOption | null>(null);
  const inCall = call.phase !== "idle" && call.phase !== "ended" && call.phase !== "unreachable";
  useRingback(open && call.phase === "connecting");

  const dial = () => {
    const prefs = readVoicePrefs(expert.key);
    voice.current = chosenVoice(voices, prefs);
    call.start({ expert: expert.key, language: prefs.language, voice: voice.current?.key ?? null });
  };

  useEffect(() => {
    if (open) dial();
  }, [open]);

  const close = (next: boolean) => {
    if (!next && inCall) call.hangUp();
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-sm" onInteractOutside={(e) => inCall && e.preventDefault()}>
        <div className="flex flex-col items-center gap-3 pt-2 text-center">
          <Portrait photoUrl={expert.photoUrl} name={expert.name} active={call.phase === "speaking"} />
          <DialogTitle className="text-lg">{expert.name}</DialogTitle>
          <DialogDescription className={cn("min-h-5 text-sm", call.phase === "unreachable" ? "text-ko" : "text-ink-3")}>
            {call.phase === "unreachable" ? call.reason : PHASE_LABEL[call.phase]}
            {(call.phase === "listening" || call.phase === "speaking" || (call.phase === "ended" && call.elapsed > 0)) && ` · ${clock(call.elapsed)}`}
          </DialogDescription>
          {voice.current && <p className="text-[12px] text-ink-3">Voix : {voice.current.label} · se change dans « Voix », sous Appeler</p>}
        </div>

        <div className="flex justify-center gap-3 pt-1">
          {inCall ? (
            <>
              <Button variant="outline" size="icon" className="rounded-full" onClick={() => call.setMuted(!call.muted)} aria-label={call.muted ? "Réactiver le micro" : "Couper le micro"}>
                {call.muted ? <MicOff /> : <Mic />}
              </Button>
              <Button variant="destructive" size="icon" className="rounded-full" onClick={call.hangUp} aria-label="Raccrocher">
                <PhoneOff />
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Fermer
              </Button>
              <Button onClick={dial}>
                <Phone />
                Rappeler
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Portrait({ photoUrl, name, active }: { photoUrl: string | null; name: string; active: boolean }) {
  return (
    <span className={cn("relative grid size-24 place-items-center overflow-hidden rounded-full bg-tint text-3xl font-bold text-brand-ink ring-4 transition-shadow", active ? "ring-brand/60" : "ring-transparent")}>
      {photoUrl ? <img src={photoUrl} alt="" className="size-full object-cover object-top" /> : name.charAt(0)}
    </span>
  );
}
