"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Loader2, RotateCw } from "lucide-react";
import type RFB from "@novnc/novnc";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type ComputerStatus = "idle" | "connecting" | "live" | "lost";

// How long the screen stays connected once nothing shows it (panel closed, another page, tab
// hidden), so coming back is instant. Past that the stream stops: it runs even on a still screen.
const LINGER_MS = 60_000;
const PANEL_KEY = "yelema.computer.panel";

interface ComputerContextValue {
  status: ComputerStatus;
  viewOnly: boolean;
  // false hands the user the mouse and keyboard.
  setViewOnly: (viewOnly: boolean) => void;
  retry: () => void;
  // Shows the screen inside `el` (the latest one attached wins); the returned function takes it back.
  attach: (el: HTMLElement) => () => void;
  // The panel beside an expert's chat, remembered across pages and visits.
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  // The large view (phones, and "Agrandir").
  dialogOpen: boolean;
  setDialogOpen: (open: boolean) => void;
}

const ComputerContext = createContext<ComputerContextValue | null>(null);

export function useComputer() {
  const ctx = useContext(ComputerContext);
  if (!ctx) throw new Error("useComputer must be used within a ComputerProvider");
  return ctx;
}

// The screen of one instance ("Son ordinateur"), one connection for the whole app: noVNC over a
// WebSocket straight to the instance, with a signed URL the BFF mints. It lives above the pages, so
// moving between the experts of that instance (they share its computer) or between the panel and
// the large view keeps the same live screen instead of reconnecting. `agentId` is the instance last
// opened; null until the user opens an expert.
export function ComputerProvider({ agentId, children }: { agentId: string | null; children: ReactNode }) {
  const [status, setStatusState] = useState<ComputerStatus>("idle");
  const [viewOnly, setViewOnlyState] = useState(true);
  const [panelOpen, setPanelOpenState] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const statusRef = useRef<ComputerStatus>("idle");
  const viewOnlyRef = useRef(true);
  const rfbRef = useRef<RFB | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const slotsRef = useRef<HTMLElement[]>([]);
  const lingerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped by every connect and disconnect, so a stale connection's events are ignored.
  const genRef = useRef(0);

  useEffect(() => {
    try {
      setPanelOpenState(localStorage.getItem(PANEL_KEY) === "1");
    } catch {
      // Stockage indisponible : le panneau reste fermé.
    }
  }, []);
  const setPanelOpen = useCallback((open: boolean) => {
    setPanelOpenState(open);
    try {
      localStorage.setItem(PANEL_KEY, open ? "1" : "0");
    } catch {
      // Le choix ne survivra pas au rechargement.
    }
  }, []);

  const setStatus = useCallback((s: ComputerStatus) => {
    statusRef.current = s;
    setStatusState(s);
  }, []);

  const setViewOnly = useCallback((v: boolean) => {
    viewOnlyRef.current = v;
    setViewOnlyState(v);
    const rfb = rfbRef.current;
    if (!rfb) return;
    rfb.viewOnly = v;
    if (!v) rfb.focus();
  }, []);

  // noVNC draws into this one element, which moves between the places that show the screen.
  const host = useCallback(() => {
    if (!hostRef.current) {
      const el = document.createElement("div");
      el.style.position = "absolute";
      el.style.inset = "0";
      hostRef.current = el;
    }
    return hostRef.current;
  }, []);

  const disconnect = useCallback(() => {
    genRef.current++;
    rfbRef.current?.disconnect();
    rfbRef.current = null;
    setStatus("idle");
  }, [setStatus]);

  const connect = useCallback(async () => {
    if (!agentId) return;
    const gen = ++genRef.current;
    rfbRef.current?.disconnect();
    rfbRef.current = null;
    setViewOnly(true);
    setStatus("connecting");
    try {
      const [{ default: RFBClient }, { ws }] = await Promise.all([
        import("@novnc/novnc"),
        apiFetch<{ ws: string }>(`/api/agents/${agentId}/computer`, { method: "POST" }),
      ]);
      if (gen !== genRef.current) return;
      const rfb = new RFBClient(host(), ws);
      rfb.scaleViewport = true;
      rfb.viewOnly = viewOnlyRef.current;
      rfb.background = "#f3f1f8";
      rfb.addEventListener("connect", () => {
        if (gen === genRef.current) setStatus("live");
      });
      rfb.addEventListener("disconnect", () => {
        if (gen !== genRef.current) return;
        rfbRef.current = null;
        setStatus("lost");
      });
      rfbRef.current = rfb;
    } catch {
      if (gen === genRef.current) setStatus("lost");
    }
  }, [agentId, host, setStatus, setViewOnly]);

  // Connected while something shows the screen and the tab is visible; otherwise it lingers, then
  // stops, and the user gets the mouse and keyboard taken back.
  const update = useCallback(() => {
    const wanted = slotsRef.current.length > 0 && document.visibilityState === "visible";
    if (wanted) {
      if (lingerRef.current) clearTimeout(lingerRef.current);
      lingerRef.current = null;
      if (statusRef.current === "idle") void connect();
      return;
    }
    setViewOnly(true);
    if (statusRef.current === "idle" || lingerRef.current) return;
    lingerRef.current = setTimeout(() => {
      lingerRef.current = null;
      disconnect();
    }, LINGER_MS);
  }, [connect, disconnect, setViewOnly]);

  const attach = useCallback(
    (el: HTMLElement) => {
      slotsRef.current.push(el);
      el.appendChild(host());
      if (statusRef.current === "lost") void connect();
      else update();
      return () => {
        slotsRef.current = slotsRef.current.filter((s) => s !== el);
        const top = slotsRef.current[slotsRef.current.length - 1];
        if (top) top.appendChild(host());
        else host().remove();
        update();
      };
    },
    [connect, host, update]
  );

  useEffect(() => {
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, [update]);

  useEffect(
    () => () => {
      if (lingerRef.current) clearTimeout(lingerRef.current);
      disconnect();
    },
    [disconnect]
  );

  const retry = useCallback(() => void connect(), [connect]);

  const value = useMemo<ComputerContextValue>(
    () => ({ status, viewOnly, setViewOnly, retry, attach, panelOpen, setPanelOpen, dialogOpen, setDialogOpen }),
    [status, viewOnly, setViewOnly, retry, attach, panelOpen, setPanelOpen, dialogOpen]
  );

  return <ComputerContext.Provider value={value}>{children}</ComputerContext.Provider>;
}

// A place that shows the live screen (the panel, the large view). Sized by `className`.
export function ComputerScreen({ className }: { className?: string }) {
  const { attach, status, retry } = useComputer();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => attach(ref.current!), [attach]);
  return (
    <div className={cn("relative overflow-hidden bg-soft", className)}>
      <div ref={ref} className="absolute inset-0" />
      {status !== "live" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-soft px-4 text-center text-sm text-ink-3">
          {status === "lost" ? (
            <>
              <p>L’écran de cet ordinateur ne répond pas pour l’instant.</p>
              <Button variant="outline" size="sm" onClick={retry}>
                <RotateCw /> Réessayer
              </Button>
            </>
          ) : (
            <>
              <Loader2 className="h-5 w-5 animate-spin" /> Connexion à l’ordinateur…
            </>
          )}
        </div>
      )}
    </div>
  );
}
