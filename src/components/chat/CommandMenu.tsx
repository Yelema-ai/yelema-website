"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { ExpertCommand } from "@/lib/expert-commands";

/**
 * The commands of the Expert, opened by « / » in the composer: its trade first, then the commands
 * every Expert has. Each line says in plain words what the command does, with an example; the
 * command itself stays small on the right, for whoever likes to type it (Leslie, 01/11).
 */
export function CommandMenu({
  name,
  items,
  total,
  active,
  onHover,
  onPick,
}: {
  name: string;
  items: ExpertCommand[];
  total: number;
  active: number;
  onHover: (i: number) => void;
  onPick: (c: ExpertCommand) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  // Never under the page's top bar: the menu takes the room left above the composer.
  const [room, setRoom] = useState(470);
  useLayoutEffect(() => {
    const top = boxRef.current?.parentElement?.getBoundingClientRect().top ?? 0;
    setRoom(Math.max(180, Math.min(470, top - 84)));
  }, []);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const own = items.filter((c) => !c.common);
  const shared = items.filter((c) => c.common);
  const row = (c: ExpertCommand) => {
    const i = items.indexOf(c);
    return (
      <button
        key={c.cmd}
        type="button"
        role="option"
        aria-selected={i === active}
        data-i={i}
        // Keep the focus in the message field: the click must not blur it before it is handled.
        onMouseDown={(e) => e.preventDefault()}
        onMouseEnter={() => onHover(i)}
        onClick={() => onPick(c)}
        className={cn("flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left", i === active && "bg-soft")}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">{c.label}</span>
          {/* The sentence only when it says more than the name; the example always. */}
          {(!c.phrase.startsWith(c.label) || c.example) && (
            <span className="block text-[12.5px] leading-snug text-ink-3">
              {!c.phrase.startsWith(c.label) && c.phrase}
              {c.example && <span className="text-ink-2">{c.phrase.startsWith(c.label) ? "" : " "}Ex. : {c.example}</span>}
            </span>
          )}
        </span>
        <span className="shrink-0 pt-0.5 text-xs text-ink-3 @max-xl:hidden">/{c.cmd}</span>
      </button>
    );
  };

  return (
    <div
      ref={boxRef}
      role="listbox"
      aria-label={`Commandes de ${name}`}
      className="absolute inset-x-0 bottom-[calc(100%+8px)] z-30 flex flex-col overflow-hidden rounded-[18px] border border-line bg-surface p-2 shadow-[0_18px_48px_rgb(23_17_43_/_0.14)]"
      style={{ maxHeight: room }}
    >
      <div ref={listRef} className="min-h-0 overflow-y-auto">
        {items.length === 0 && <p className="px-3 py-3 text-sm text-ink-3">Aucune commande ne correspond.</p>}
        {own.length > 0 && <h4 className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">Les commandes de {name}</h4>}
        {own.map(row)}
        {shared.length > 0 && <h4 className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">Pour tous les Experts</h4>}
        {shared.map(row)}
      </div>
      <div className="mt-1.5 flex justify-between border-t border-line px-3 pb-0.5 pt-2 text-xs text-ink-3">
        <span className="@max-xl:hidden">↑ ↓ pour choisir, Entrée pour valider</span>
        <span>{total} commandes</span>
      </div>
    </div>
  );
}
