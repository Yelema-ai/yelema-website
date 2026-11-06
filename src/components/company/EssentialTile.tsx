import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

// One of the three tiles on top of Contexte: logo, brand book, presentation (Leslie, 06/11: the page was
// too heavy, the same things shown twice). Icon, name, one line, and its actions under it.
export function EssentialTile({
  icon,
  title,
  line,
  done,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  line: React.ReactNode;
  done: boolean;
  children?: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-[18px] border border-line bg-surface p-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-tint text-brand-ink">
          {icon}
        </span>
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
