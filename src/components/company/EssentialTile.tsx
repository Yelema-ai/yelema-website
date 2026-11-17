import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

// One of the three tiles on top of Contexte: logo, brand book, presentation (Leslie, 06/11: the page was
// too heavy, the same things shown twice). Icon, name, one line, and its actions under it.
export function EssentialTile({
  icon,
  title,
  line,
  done,
  empty = false,
  media,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  line: React.ReactNode;
  done: boolean;
  /** Nothing there yet: the tile is drawn in dashes, so the gap shows (Leslie, 06/11). */
  empty?: boolean;
  /** In place of the icon square: thumbnails (the logos). */
  media?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-3 rounded-[18px] bg-surface p-4", empty ? "border-2 border-dashed border-brand/30" : "border border-line")}>
      <div className="flex min-w-0 items-center gap-3">
        {media ?? (
          <span className="relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-tint text-brand-ink">
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-1.5 text-[15px] font-bold text-ink">
            {title}
            {done && <Check className="size-4 text-ok" aria-label="fait" />}
          </h3>
          <div className={cn("truncate text-[13px]", done ? "text-ink-3" : "text-ink-2")}>{line}</div>
        </div>
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </section>
  );
}
