"use client";

import { Maximize2, Monitor, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ComputerScreen, useComputer } from "./ComputerProvider";

// "Son ordinateur": the computer the experts work on, live. A member's instance has one, shared by
// the experts installed on it. On a wide screen it opens as a panel beside the chat, so the user watches the expert work
// while the reply streams; elsewhere (and with "Agrandir") as a large dialog. Both show the same
// connection (ComputerProvider). The user watches by default; "Prendre la main" hands them the mouse
// and keyboard (a sign-in, a code sent to their phone) and stops this expert's reply in flight, so
// the two never fight over the browser.

// The `wide` breakpoint (globals.css): below it the chat would be too narrow beside the panel, so the
// button opens the dialog instead.
const WIDE = "(min-width: 85rem)";

interface ComputerProps {
  expert: { name: string };
  // This conversation's reply is still running.
  busy: boolean;
  onTakeOver: () => void;
}

function useControl({ expert, busy, onTakeOver }: ComputerProps) {
  const { status, viewOnly, setViewOnly } = useComputer();
  const hint = !viewOnly
    ? "Vous avez la main : la souris et le clavier sont à vous."
    : busy
      ? `${expert.name} est en train de travailler : prendre la main arrête sa réponse.`
      : "Prenez la main pour cliquer ou taper, par exemple pour vous connecter à un site.";
  const toggle = () => {
    if (viewOnly && busy) onTakeOver();
    setViewOnly(!viewOnly);
  };
  return { hint, toggle, viewOnly, canToggle: status === "live", live: status === "live" };
}

const screenFrame = (viewOnly: boolean) =>
  cn("aspect-[16/10] w-full rounded-[14px] border", viewOnly ? "border-border" : "border-primary ring-2 ring-primary/20");

const LiveDot = () => <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-ko" />;

export function ComputerButton() {
  const { panelOpen, setPanelOpen, setDialogOpen } = useComputer();
  return (
    <button
      type="button"
      title="Son ordinateur"
      onClick={() => (window.matchMedia(WIDE).matches ? setPanelOpen(!panelOpen) : setDialogOpen(true))}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full border bg-card px-3 text-[13px] font-semibold text-ink hover:bg-soft",
        panelOpen && "wide:border-brand/30 wide:bg-soft-2 wide:text-brand-ink"
      )}
    >
      <Monitor className="h-4 w-4" />
      {/* Beside the open panel the chat is narrow, and the highlighted icon says enough. */}
      <span className={cn("hidden sm:inline", panelOpen && "wide:hidden")}>Son ordinateur</span>
    </button>
  );
}

export function ComputerPanel(props: ComputerProps) {
  const { panelOpen, setPanelOpen, setDialogOpen } = useComputer();
  const { hint, toggle, viewOnly, canToggle, live } = useControl(props);
  if (!panelOpen) return null;
  return (
    <aside className="hidden max-w-[900px] shrink basis-[60%] flex-col border-l bg-card wide:flex">
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            {live && <LiveDot />} Son ordinateur
          </p>
          <p className="truncate text-xs text-ink-3">Tous vos experts travaillent sur cet ordinateur.</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setDialogOpen(true)} aria-label="Agrandir" title="Agrandir">
            <Maximize2 />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setPanelOpen(false)} aria-label="Fermer" title="Fermer">
            <X />
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        <ComputerScreen className={screenFrame(viewOnly)} />
        <div className="flex items-center gap-3">
          <p className="mr-auto text-[13px] text-ink-3">{hint}</p>
          <Button variant="outline" size="sm" onClick={toggle} disabled={!canToggle}>
            {viewOnly ? "Prendre la main" : "Rendre la main"}
          </Button>
        </div>
      </div>
    </aside>
  );
}

export function ComputerDialog({ onWrite, ...props }: ComputerProps & { onWrite: () => void }) {
  const { dialogOpen, setDialogOpen } = useComputer();
  const { hint, toggle, viewOnly, canToggle, live } = useControl(props);
  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent
        className="max-w-[1100px] gap-4 p-5 sm:p-6"
        // With the keyboard handed over, Escape belongs to the remote browser.
        onEscapeKeyDown={(e) => {
          if (!viewOnly) e.preventDefault();
        }}
      >
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="font-display text-[20px] font-bold tracking-tight text-ink">
            L’ordinateur de {props.expert.name}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2 text-[13px] text-ink-3">
            {live && <LiveDot />}
            {live ? "En direct. " : ""}Tous vos experts travaillent sur cet ordinateur.
          </DialogDescription>
        </DialogHeader>

        <ComputerScreen className={cn(screenFrame(viewOnly), "max-h-[calc(100vh-230px)]")} />

        <DialogFooter className="items-center gap-2 sm:space-x-0">
          <p className="mr-auto text-[13px] text-ink-3">{hint}</p>
          <Button variant="outline" onClick={toggle} disabled={!canToggle}>
            {viewOnly ? "Prendre la main" : "Rendre la main"}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setDialogOpen(false);
              onWrite();
            }}
          >
            Écrire à {props.expert.name}
          </Button>
          <Button onClick={() => setDialogOpen(false)}>Fermer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
