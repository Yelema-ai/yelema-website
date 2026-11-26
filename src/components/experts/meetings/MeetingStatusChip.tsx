import { STATUS_LABELS, type StatusTone } from "@/lib/meetings/labels";
import type { MeetingStatus } from "@/lib/meetings/view";
import { cn } from "@/lib/utils";

const TONES: Record<StatusTone, string> = {
  live: "bg-ok-pale text-ok",
  progress: "bg-soft-2 text-ink-2",
  action: "bg-coral-pale text-coral-ink",
  done: "bg-tint text-brand-ink",
  error: "bg-ko-pale text-ko",
  muted: "bg-soft text-ink-3",
};

export function MeetingStatusChip({ status, className }: { status: MeetingStatus; className?: string }) {
  const { label, tone } = STATUS_LABELS[status];
  return <span className={cn("inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[12px] font-semibold", TONES[tone], className)}>{label}</span>;
}
