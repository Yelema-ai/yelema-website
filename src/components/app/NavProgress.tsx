"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// A thin bar along the top of the page, started by the click itself: a link answers at once, even
// while the server is still preparing the next page, so nobody clicks a second time to be sure.
// It finishes when the address changes; a click that leads nowhere new lets it fade after a while.
const GIVE_UP_MS = 15_000;

// The page this click is going to, when it is a page of the app the router will open itself.
function destination(e: MouseEvent): URL | null {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return null;
  const url = new URL(a.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  const here = window.location;
  if (url.pathname === here.pathname && url.search === here.search) return null;
  return url;
}

export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [phase, setPhase] = useState<"idle" | "going" | "done">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!destination(e)) return;
      setPhase("going");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setPhase("done"), GIVE_UP_MS);
    };
    // Capture: next/link cancels the browser's own navigation before the click bubbles up here.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    setPhase((p) => (p === "going" ? "done" : p));
  }, [pathname, search]);

  useEffect(() => {
    if (phase !== "done") return;
    if (timer.current) clearTimeout(timer.current);
    const t = setTimeout(() => setPhase("idle"), 300);
    return () => clearTimeout(t);
  }, [phase]);

  if (phase === "idle") return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px]">
      <style>{"@keyframes yl-navgo{from{width:0}12%{width:45%}to{width:85%}}"}</style>
      <div
        className="h-full bg-brand transition-[width,opacity] duration-300 ease-out"
        style={phase === "going" ? { animation: "yl-navgo 8s cubic-bezier(.1,.7,.3,1) forwards" } : { width: "100%", opacity: 0 }}
      />
    </div>
  );
}

/**
 * The address the menu shows as current: the page just clicked, from the click on, then the real
 * one once the router is there. The menu lights the row under the finger without waiting.
 */
export function useShownPath(): string {
  const pathname = usePathname();
  const [going, setGoing] = useState<{ from: string; to: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const url = destination(e);
      if (!url) return;
      setGoing({ from: window.location.pathname, to: url.pathname });
      // A click some handler kept from leading anywhere must not leave the row lit.
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setGoing(null), GIVE_UP_MS);
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  // Arrived, or moved elsewhere meanwhile: the real address speaks again.
  return going && going.from === pathname && going.to !== pathname ? going.to : pathname;
}
