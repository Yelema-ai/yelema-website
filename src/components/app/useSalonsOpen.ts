"use client";

import { useEffect, useState } from "react";
import { useWorkspace } from "@/components/WorkspaceProvider";

// Whether « Salons » belongs in the menu: only once the back office has opened them for the company. It says so
// in `/app/me` (`salons`, already read with the workspace): no extra call. An older back office does not say:
// the Salons page then tells, from the refusal of `/app/buzz`, and this device remembers it, so the entry
// neither blinks in nor out on the next visit.
const KEY = "yelema.salons-ouverts";

function remembered(): boolean | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "1" ? true : v === "0" ? false : null;
  } catch {
    return null;
  }
}

/** What the Salons page learnt (open, or refused with `salons_closed`): the menu follows on the next visit. */
export function rememberSalonsOpen(open: boolean): void {
  try {
    localStorage.setItem(KEY, open ? "1" : "0");
  } catch {}
}

export function useSalonsOpen(enabled: boolean): boolean {
  const said = useWorkspace().current?.salons;
  const [kept, setKept] = useState<boolean | null>(null);
  useEffect(() => {
    if (!enabled) return;
    if (typeof said === "boolean") rememberSalonsOpen(said);
    else setKept(remembered());
  }, [enabled, said]);
  if (!enabled) return false;
  if (typeof said === "boolean") return said;
  // Unknown (first visit with an older back office): shown, the page itself says if they are not open.
  return kept !== false;
}
