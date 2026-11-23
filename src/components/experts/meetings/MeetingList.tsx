"use client";

import { useState } from "react";
import { CalendarClock, ExternalLink, FileText, Loader2, RotateCcw, Send, Video } from "lucide-react";
import { toast } from "sonner";
import { deliveryNote, listMeta, meetingTitle } from "@/lib/meetings/labels";
import { isOngoing, isReady, isUpcoming, type MeetingView } from "@/lib/meetings/view";
import { Button } from "@/components/ui/button";
import { MeetingStatusChip } from "./MeetingStatusChip";

export interface RowActions {
  onSend: (meeting: MeetingView) => void;
  onRewrite: (id: string) => Promise<unknown>;
}

function RowContent({ meeting, now }: { meeting: MeetingView; now: Date }) {
  const Icon = isUpcoming(meeting.status) ? CalendarClock : isOngoing(meeting.status) ? Video : FileText;
  const failure = meeting.status !== "sending" ? meeting.lastFailure?.reason : null;
  const sent = meeting.status === "sent" ? deliveryNote(meeting, now) : null;
  const waiting = meeting.status === "waiting" ? `Acceptez ${meeting.byline?.expert ?? "l’expert IA"} depuis la salle d’attente de la réunion.` : null;
  return (
    <>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-soft text-ink-2">
        <Icon className="size-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[15px] font-bold leading-snug text-ink">{meetingTitle(meeting)}</span>
          {meeting.pageUrl && <ExternalLink className="size-3.5 shrink-0 text-ink-3" aria-hidden />}
        </span>
        <span className="mt-0.5 block text-[13px] text-ink-3">{listMeta(meeting, now)}</span>
        {sent && <span className="mt-0.5 block text-[12px] font-medium text-ok">{sent}</span>}
        {waiting && <span className="mt-0.5 block text-[12px] font-medium text-coral-ink">{waiting}</span>}
        {failure && <span className="mt-0.5 block text-[12px] font-medium text-ko">{failure}</span>}
      </span>
      <MeetingStatusChip status={meeting.status} />
    </>
  );
}

function RewriteButton({ id, onRewrite }: { id: string; onRewrite: (id: string) => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={busy}
      className="shrink-0 rounded-full"
      onClick={async () => {
        setBusy(true);
        try {
          await onRewrite(id);
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="animate-spin" /> : <RotateCcw />} <span className="max-sm:sr-only">Relancer</span>
    </Button>
  );
}

export function MeetingRow({ meeting, now, onSend, onRewrite }: { meeting: MeetingView; now: Date } & RowActions) {
  const title = meetingTitle(meeting);
  const content = "flex min-w-0 flex-1 items-center gap-3 py-3.5 pl-4 text-left";
  return (
    <li className="flex items-center gap-2 rounded-2xl border border-line bg-surface pr-3 transition-colors has-[a:hover]:bg-soft">
      {meeting.pageUrl ? (
        <a href={meeting.pageUrl} target="_blank" rel="noopener noreferrer" aria-label={`Ouvrir le compte rendu ${title}`} className={content}>
          <RowContent meeting={meeting} now={now} />
        </a>
      ) : (
        <div className={content}>
          <RowContent meeting={meeting} now={now} />
        </div>
      )}
      {isReady(meeting.status) && (
        <Button size="sm" variant={meeting.status === "to_send" ? "default" : "outline"} onClick={() => onSend(meeting)} aria-label={`Envoyer ${title}`} className="shrink-0 rounded-full">
          <Send /> <span className="max-sm:sr-only">Envoyer</span>
        </Button>
      )}
      {meeting.status === "stalled" && <RewriteButton id={meeting.id} onRewrite={onRewrite} />}
    </li>
  );
}

export function MeetingRows({ items, ...actions }: { items: MeetingView[] } & RowActions) {
  const now = new Date();
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((m) => (
        <MeetingRow key={m.id} meeting={m} now={now} {...actions} />
      ))}
    </ul>
  );
}
