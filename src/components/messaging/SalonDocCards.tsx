"use client";

import { FileText } from "lucide-react";
import { shortName } from "@/lib/buzz";
import { docKind } from "@/lib/drive-links";
import type { SalonDeliverable } from "@/lib/salon-deliverables";
import { cn } from "@/lib/utils";
import { PreviewAt } from "@/components/chat/DocumentCards";
import { DOC_TONE } from "@/components/files/preview-siblings";

// The salon files a message cites, as the chat shows an Expert's documents: the preview (read once on
// screen), then its line. Both open the file as the Livrables tab does.

// A list read again signs every address anew: a preview keeps the one it read while it is valid.
const KEEP_MS = 10 * 60_000;
const kept = new Map<string, { url: string; at: number }>();
function stableUrl(d: SalonDeliverable & { url: string }): string {
  const k = `${d.id}\n${d.updatedAt}`;
  const hit = kept.get(k);
  if (hit && Date.now() - hit.at < KEEP_MS) return hit.url;
  if (kept.size > 200) kept.clear();
  kept.set(k, { url: d.url, at: Date.now() });
  return d.url;
}

export function SalonDocCards({ docs }: { docs: (SalonDeliverable & { url: string })[] }) {
  if (!docs.length) return null;
  return (
    <ul aria-label="Documents" className="mt-2 flex w-full min-w-0 max-w-[min(90%,70ch)] flex-col gap-3">
      {docs.map((d) => {
        const kind = docKind(d.title);
        const url = stableUrl(d);
        const open = { href: url, target: "_blank", rel: "noopener noreferrer" };
        return (
          <li key={d.id} className="min-w-0">
            <a {...open} aria-label={`Ouvrir ${d.title}`} className="block h-60 w-full overflow-hidden rounded-2xl border border-line bg-soft transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 sm:h-80">
              <PreviewAt doc={{ name: d.title, path: d.title, size: null, modified: Date.parse(d.updatedAt) || null, kind }} url={url} />
            </a>
            <a {...open} className="mt-2 flex min-w-0 items-center gap-3 rounded-2xl border border-line bg-surface p-2.5 pl-3 hover:bg-soft">
              <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl text-white", kind === "other" ? "bg-tint text-brand-ink" : DOC_TONE[kind])}>
                <FileText className="size-5" />
              </span>
              <span className="w-0 min-w-0 grow">
                <span className="block truncate text-[14px] font-semibold text-ink">{d.title}</span>
                <span className="block truncate text-[12.5px] text-ink-3">{shortName(d.auteur)}</span>
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
