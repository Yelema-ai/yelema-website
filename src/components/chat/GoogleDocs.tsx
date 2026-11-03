"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Pin } from "lucide-react";
import { GOOGLE_LABEL, type GoogleDoc, type GoogleKind } from "@/lib/google-docs";
import { relativeFr } from "@/lib/fr-dates";
import { cn } from "@/lib/utils";

// Google Sheets, Docs and Slides in the chat (Leslie, 31/10): a card under the reply that made or
// changed one, the one in progress pinned above the conversation, each opened in Google in a new tab.

const COLORS: Record<GoogleKind, { fill: string; fold: string; tint: string }> = {
  sheets: { fill: "#188038", fold: "#87ceac", tint: "bg-[#e6f4ea]" },
  docs: { fill: "#1a73e8", fold: "#a1c2fa", tint: "bg-[#e8f0fe]" },
  slides: { fill: "#f29900", fold: "#fdd663", tint: "bg-[#fef7e0]" },
};

/** The format's own mark: a page in its colour, a grid (Sheets), lines (Docs) or a slide (Slides). */
export function GoogleGlyph({ kind, className }: { kind: GoogleKind; className?: string }) {
  const c = COLORS[kind];
  return (
    <svg viewBox="0 0 48 64" aria-hidden className={cn("h-[26px] w-5 shrink-0", className)}>
      <path d="M0 4a4 4 0 0 1 4-4h28l16 16v44a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4z" fill={c.fill} />
      <path d="M32 0l16 16H36a4 4 0 0 1-4-4z" fill={c.fold} />
      {kind === "sheets" && (
        <>
          <path d="M10 28h28v22H10z" fill="#fff" />
          <path d="M10 35h28M10 42h28M22 28v22" stroke={c.fill} strokeWidth="2.5" />
        </>
      )}
      {kind === "docs" && <path d="M11 30h26M11 37h26M11 44h26M11 51h17" stroke="#fff" strokeWidth="3" />}
      {kind === "slides" && <rect x="10" y="30" width="28" height="18" rx="2" fill="none" stroke="#fff" strokeWidth="3" />}
    </svg>
  );
}

export function GoogleTile({ kind, className }: { kind: GoogleKind; className?: string }) {
  return (
    <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", COLORS[kind].tint, className)}>
      <GoogleGlyph kind={kind} />
    </span>
  );
}

// ── Pinned documents (Leslie, 03/11: « tu ne peux plus en mettre un deuxième ») ─────────────────────────
// The client chooses which documents stay first above the conversation, several if they like. Kept in this
// browser, per conversation (no back-office route yet), the last pinned first.

type Pins = { pinned: string[]; toggle: (id: string) => void };
const PinsContext = createContext<Pins | null>(null);
const pinKey = (scope: string) => `yelema.documents-epingles.${scope}`;

function readPins(scope: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(pinKey(scope)) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 50) : [];
  } catch {
    return [];
  }
}

/** The pinned documents of one conversation (`scope`: instance, expert, session), and how to change them. */
export function usePinnedDocs(scope: string | null): Pins {
  const [pinned, setPinned] = useState<string[]>([]);
  useEffect(() => {
    setPinned(scope ? readPins(scope) : []);
  }, [scope]);
  const toggle = useCallback(
    (id: string) => {
      if (!scope) return;
      setPinned((cur) => {
        const next = cur.includes(id) ? cur.filter((x) => x !== id) : [id, ...cur];
        try {
          localStorage.setItem(pinKey(scope), JSON.stringify(next));
        } catch {
          /* private window: pinned for this visit only */
        }
        return next;
      });
    },
    [scope]
  );
  return useMemo(() => ({ pinned, toggle }), [pinned, toggle]);
}

export function PinnedDocsProvider({ value, children }: { value: Pins; children: React.ReactNode }) {
  return <PinsContext.Provider value={value}>{children}</PinsContext.Provider>;
}

function PinButton({ doc, compact }: { doc: GoogleDoc; compact?: boolean }) {
  const pins = useContext(PinsContext);
  if (!pins) return null;
  const on = pins.pinned.includes(doc.id);
  return (
    <button
      type="button"
      onClick={() => pins.toggle(doc.id)}
      aria-pressed={on}
      aria-label={on ? `Désépingler ${doc.title}` : `Épingler ${doc.title} en haut de la conversation`}
      title={on ? "Désépingler" : "Garder en haut de la conversation"}
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-[13px] font-semibold",
        on ? "border-transparent bg-tint text-brand-ink hover:bg-soft-2" : "border-line text-ink hover:bg-soft"
      )}
    >
      <Pin className={cn("size-4", on && "fill-current")} />
      <span className={cn(compact ? "hidden" : "hidden min-[400px]:inline")}>{on ? "Épinglé" : "Épingler"}</span>
    </button>
  );
}

/** Under a reply: one card per Google document it made or changed. */
export function GoogleDocCards({ docs }: { docs: GoogleDoc[] }) {
  if (!docs.length) return null;
  return (
    <ul aria-label="Documents Google" className="mt-3 flex flex-col gap-2">
      {docs.map((d) => (
        <li key={d.id} className="min-w-0">
          <div className="flex min-w-0 max-w-[460px] items-center gap-3 rounded-2xl border border-line bg-surface p-2.5 pl-3">
            <GoogleTile kind={d.kind} />
            <span className="min-w-0 grow">
              <span title={d.title} className="block truncate text-[14px] font-semibold text-ink">
                {d.title}
              </span>
              <span className="block text-[12.5px] text-ink-3">{GOOGLE_LABEL[d.kind]}</span>
            </span>
            <PinButton doc={d} />
            <a
              href={d.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Ouvrir ${d.title} dans ${GOOGLE_LABEL[d.kind]}`}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-line px-3 text-[13px] font-semibold text-ink hover:bg-soft"
            >
              <ExternalLink className="size-4" /> <span className="hidden min-[400px]:inline">Ouvrir</span>
            </a>
          </div>
        </li>
      ))}
    </ul>
  );
}

const SHOWN = 3;

/**
 * Above the conversation: its Google documents in one row (Leslie, 03/11), the pinned ones first, then the
 * last used; three shown, « + N » opens them all. One click opens a document in Google.
 */
export function GoogleDocsRow({ docs }: { docs: (GoogleDoc & { usedAt: number | null })[] }) {
  const pins = useContext(PinsContext);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const pinned = pins?.pinned ?? [];
  const ordered = useMemo(() => {
    const byId = new Map(docs.map((d) => [d.id, d]));
    const first = pinned.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
    return [...first, ...docs.filter((d) => !pinned.includes(d.id))];
  }, [docs, pinned]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  if (!ordered.length) return null;
  const rest = ordered.length - SHOWN;
  return (
    <div className="mx-auto w-full max-w-3xl shrink-0 px-4 py-2 sm:px-6">
      <div ref={box} className="relative flex min-w-0 items-center gap-2" aria-label="Documents de la conversation">
        <span className="shrink-0 text-[11.5px] font-semibold uppercase tracking-wide text-ink-3 max-sm:hidden">Documents</span>
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          {ordered.slice(0, SHOWN).map((d, i) => {
            const on = pinned.includes(d.id);
            return (
              <a
                key={d.id}
                href={d.url}
                target="_blank"
                rel="noopener noreferrer"
                title={`${d.title}, ${GOOGLE_LABEL[d.kind]}`}
                aria-label={`Ouvrir ${d.title} dans ${GOOGLE_LABEL[d.kind]}${on ? ", épinglé" : ""}`}
                className={cn(
                  "inline-flex h-9 min-w-0 max-w-[240px] shrink items-center gap-2 rounded-xl border pl-2 pr-2.5 text-[13px] font-semibold text-ink hover:bg-soft",
                  on ? "border-brand/25 bg-tint/40" : "border-line bg-surface",
                  // On a phone one document is enough to read: the others are behind « + N ».
                  i > 0 && "max-sm:hidden"
                )}
              >
                {on && <Pin className="size-3.5 shrink-0 fill-current text-brand-ink" aria-hidden />}
                <GoogleGlyph kind={d.kind} className="h-[21px] w-4" />
                <span className="truncate">{d.title}</span>
              </a>
            );
          })}
        </div>
        {ordered.length > 1 ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label="Tous les documents de la conversation"
            className={cn("inline-flex h-9 shrink-0 items-center rounded-xl border border-dashed border-ink-3/40 px-3 text-[13px] font-semibold text-ink-2 hover:bg-soft", open && "bg-soft")}
          >
            <span className="sm:hidden">+ {ordered.length - 1}</span>
            <span className="max-sm:hidden">{rest > 0 ? `+ ${rest}` : "Tous"}</span>
          </button>
        ) : null}
        {open && (
          <div role="dialog" aria-label="Documents de la conversation" className="absolute right-0 top-11 z-30 w-[min(380px,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-1.5 shadow-lg">
            <ul className="max-h-[360px] overflow-y-auto">
              {ordered.map((d) => {
                const on = pinned.includes(d.id);
                return (
                  <li key={d.id} className="flex items-center gap-1 rounded-xl hover:bg-soft">
                    <a href={d.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2">
                      <GoogleGlyph kind={d.kind} />
                      <span className="min-w-0 leading-tight">
                        <span className="block truncate text-[14px] font-semibold text-ink">{d.title}</span>
                        <span className="block text-[12px] text-ink-3">
                          {GOOGLE_LABEL[d.kind]}
                          {d.usedAt ? `, ${relativeFr(d.usedAt)}` : ""}
                        </span>
                      </span>
                    </a>
                    {pins && (
                      <button
                        type="button"
                        onClick={() => pins.toggle(d.id)}
                        aria-pressed={on}
                        aria-label={on ? `Désépingler ${d.title}` : `Épingler ${d.title}`}
                        title={on ? "Désépingler" : "Garder en haut"}
                        className={cn("mr-1 grid size-10 shrink-0 place-items-center rounded-lg", on ? "text-brand-ink" : "text-ink-3 hover:text-ink")}
                      >
                        <Pin className={cn("size-4", on && "fill-current")} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
