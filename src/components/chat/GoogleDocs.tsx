"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ExternalLink, Pin } from "lucide-react";
import { GOOGLE_LABEL, type GoogleDoc, type GoogleKind } from "@/lib/google-docs";
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

// ── The pinned document (Leslie, 03/11) ─────────────────────────────────────────────────────────────────
// One document stays above the conversation, never two or three (« ça surchargera encore plus la vue »):
// the one the client pinned from the « Livrables » menu, else the last one used. Kept in this browser, per
// conversation (no back-office route yet). Stored as a list, as #110 did, so a pin made then still reads.

type Pins = { pinned: string[]; toggle: (id: string) => void };
const PinsContext = createContext<Pins | null>(null);
const pinKey = (scope: string) => `yelema.documents-epingles.${scope}`;

function readPins(scope: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(pinKey(scope)) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 1) : [];
  } catch {
    return [];
  }
}

/** The pinned document of one conversation (`scope`: instance, expert, session), and how to change it. */
export function usePinnedDocs(scope: string | null): Pins {
  const [pinned, setPinned] = useState<string[]>([]);
  useEffect(() => {
    setPinned(scope ? readPins(scope) : []);
  }, [scope]);
  const toggle = useCallback(
    (id: string) => {
      if (!scope) return;
      setPinned((cur) => {
        // Pinning one unpins the other; pinning it again gives the place back to the last one used.
        const next = cur[0] === id ? [] : [id];
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

/** The pins of the conversation around, or null outside one. */
export const usePins = () => useContext(PinsContext);

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

/** Above the conversation: one Google document, the pinned one or else the last used, one click from anywhere in it. */
export function GoogleDocsRow({ docs }: { docs: (GoogleDoc & { usedAt: number | null })[] }) {
  const pins = useContext(PinsContext);
  const doc = docs.find((d) => pins?.pinned.includes(d.id)) ?? docs[0] ?? null;
  if (!doc) return null;
  const on = Boolean(pins?.pinned.includes(doc.id));
  return (
    <div className="mx-auto flex w-full max-w-3xl shrink-0 items-center gap-2.5 px-4 py-2 sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl border border-line bg-surface py-2 pl-3 pr-2">
        <GoogleGlyph kind={doc.kind} />
        <span className="min-w-0 grow leading-tight">
          <span title={doc.title} className="flex min-w-0 items-center gap-1.5 text-[13.5px] font-semibold text-ink">
            {on && <Pin className="size-3.5 shrink-0 fill-current text-brand-ink" aria-label="Épinglé" />}
            <span className="truncate">{doc.title}</span>
          </span>
          <span className="block text-[12px] text-ink-3">{on ? "Épinglé" : "Document en cours"}, {GOOGLE_LABEL[doc.kind]}</span>
        </span>
        <a
          href={doc.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Ouvrir ${doc.title} dans ${GOOGLE_LABEL[doc.kind]}`}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-tint px-3 text-[13px] font-semibold text-brand-ink hover:bg-soft-2"
        >
          <ExternalLink className="size-4" /> <span className="max-sm:hidden">Ouvrir</span>
        </a>
      </div>
    </div>
  );
}
