"use client";

import { useEffect, useState } from "react";

// Whether « Salons » belongs in the menu: only once the back office has opened them for the company.
// This device remembers the last answer, so the entry neither blinks in nor out on the next visit;
// a failure (network, relay down) changes nothing. One read per tab.
const KEY = "yelema.salons-ouverts";
let asked: Promise<boolean | null> | null = null;

function remembered(): boolean | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "1" ? true : v === "0" ? false : null;
  } catch {
    return null;
  }
}

export function useSalonsOpen(enabled: boolean): boolean {
  const [open, setOpen] = useState<boolean | null>(null);
  useEffect(() => {
    if (!enabled) return;
    setOpen(remembered());
    asked ??= fetch("/api/buzz/ouvert", { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? (r.json() as Promise<{ open?: boolean }>) : null))
      .then((b) => (typeof b?.open === "boolean" ? b.open : null))
      .catch(() => null);
    let live = true;
    asked.then((answer) => {
      if (answer === null) asked = null;
      else {
        try {
          localStorage.setItem(KEY, answer ? "1" : "0");
        } catch {}
      }
      if (live && answer !== null) setOpen(answer);
    });
    return () => {
      live = false;
    };
  }, [enabled]);
  // Unknown (first visit, or the back office did not answer): shown, the page itself says if they are not open.
  return enabled && open !== false;
}
