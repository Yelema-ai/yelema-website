"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Monitor, RotateCw } from "lucide-react";
import type RFB from "@novnc/novnc";
import { type Expert } from "@/config/experts";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Status = "connecting" | "live" | "lost";

// The live screen, drawn by noVNC over a WebSocket straight to the instance (the BFF mints the
// signed URL). Connected only while it is mounted, i.e. while the dialog is open: the stream runs
// even when nothing on the screen changes. `attempt` reconnects with a fresh token.
function Screen({
  agentId,
  viewOnly,
  attempt,
  onStatus,
}: {
  agentId: string;
  viewOnly: boolean;
  attempt: number;
  onStatus: (s: Status) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<RFB | null>(null);
  const viewOnlyRef = useRef(viewOnly);
  viewOnlyRef.current = viewOnly;

  useEffect(() => {
    let rfb: RFB | null = null;
    let gone = false;
    onStatus("connecting");
    (async () => {
      try {
        const [{ default: RFBClient }, { ws }] = await Promise.all([
          import("@novnc/novnc"),
          apiFetch<{ ws: string }>(`/api/agents/${agentId}/computer`, { method: "POST" }),
        ]);
        if (gone || !ref.current) return;
        rfb = new RFBClient(ref.current, ws);
        rfb.scaleViewport = true;
        rfb.viewOnly = viewOnlyRef.current;
        rfb.background = "#f3f1f8";
        rfb.addEventListener("connect", () => onStatus("live"));
        rfb.addEventListener("disconnect", () => {
          if (!gone) onStatus("lost");
        });
        rfbRef.current = rfb;
      } catch {
        if (!gone) onStatus("lost");
      }
    })();
    return () => {
      gone = true;
      rfb?.disconnect();
      rfbRef.current = null;
    };
  }, [agentId, attempt, onStatus]);

  useEffect(() => {
    const rfb = rfbRef.current;
    if (!rfb) return;
    rfb.viewOnly = viewOnly;
    if (!viewOnly) rfb.focus();
  }, [viewOnly]);

  return <div ref={ref} className="absolute inset-0" />;
}

// "Son ordinateur": the computer the experts work on, live. A workspace has one, shared by every
// expert, so each expert's button opens the same screen. The user watches by default; "Prendre la
// main" hands them the mouse and keyboard (a sign-in, a code sent to their phone) and stops this
// expert's reply in flight, so the two never fight over the browser.
export function ExpertComputer({
  agentId,
  expert,
  busy,
  onTakeOver,
  onWrite,
}: {
  agentId: string;
  expert: Expert;
  // This conversation's reply is still running.
  busy: boolean;
  onTakeOver: () => void;
  onWrite: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("connecting");
  const [viewOnly, setViewOnly] = useState(true);
  const [attempt, setAttempt] = useState(0);

  const openChange = (next: boolean) => {
    setOpen(next);
    if (next) setViewOnly(true);
  };

  const toggleControl = () => {
    if (viewOnly && busy) onTakeOver();
    setViewOnly(!viewOnly);
  };

  const hint = !viewOnly
    ? "Vous avez la main : la souris et le clavier sont à vous."
    : busy
      ? `${expert.name} est en train de travailler : prendre la main arrête sa réponse.`
      : "Prenez la main pour cliquer ou taper, par exemple pour vous connecter à un site.";

  return (
    <>
      <button
        type="button"
        onClick={() => openChange(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[13px] font-semibold text-ink hover:bg-soft"
      >
        <Monitor className="h-4 w-4" /> <span className="hidden sm:inline">Son ordinateur</span>
      </button>
      <Dialog open={open} onOpenChange={openChange}>
        <DialogContent
          className="max-w-[1100px] gap-4 p-5 sm:p-6"
          // With the keyboard handed over, Escape belongs to the remote browser.
          onEscapeKeyDown={(e) => {
            if (!viewOnly) e.preventDefault();
          }}
        >
          <DialogHeader className="pr-8 text-left">
            <DialogTitle className="font-display text-[20px] font-bold tracking-tight text-ink">
              L’ordinateur de {expert.name}
            </DialogTitle>
            <DialogDescription className="flex items-center gap-2 text-[13px] text-ink-3">
              {status === "live" && <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-ko" />}
              {status === "live" ? "En direct. " : ""}Tous vos experts travaillent sur cet ordinateur.
            </DialogDescription>
          </DialogHeader>

          <div
            className={cn(
              "relative aspect-[16/10] max-h-[calc(100vh-230px)] w-full overflow-hidden rounded-[14px] border bg-soft",
              viewOnly ? "border-line" : "border-brand ring-2 ring-brand/20"
            )}
          >
            <Screen agentId={agentId} viewOnly={viewOnly} attempt={attempt} onStatus={setStatus} />
            {status !== "live" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-soft text-center text-sm text-ink-3">
                {status === "connecting" ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" /> Connexion à l’ordinateur…
                  </>
                ) : (
                  <>
                    <p>L’écran de cet ordinateur ne répond pas pour l’instant.</p>
                    <Button variant="outline" size="sm" onClick={() => setAttempt((n) => n + 1)}>
                      <RotateCw /> Réessayer
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="items-center gap-2 sm:space-x-0">
            <p className="mr-auto text-[13px] text-ink-3">{hint}</p>
            <Button variant="outline" onClick={toggleControl} disabled={status !== "live"}>
              {viewOnly ? "Prendre la main" : "Rendre la main"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                openChange(false);
                onWrite();
              }}
            >
              Écrire à {expert.name}
            </Button>
            <Button onClick={() => openChange(false)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
