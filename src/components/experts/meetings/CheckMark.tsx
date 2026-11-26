import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function CheckMark({ on, className }: { on: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-[18px] shrink-0 place-items-center rounded-[4px] border-2 transition-colors",
        on ? "border-brand bg-brand text-on-brand" : "border-ink-3 bg-surface text-transparent",
        className
      )}
    >
      <Check className="size-3" strokeWidth={3.5} />
    </span>
  );
}
