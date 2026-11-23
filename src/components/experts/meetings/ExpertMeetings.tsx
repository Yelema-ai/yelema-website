"use client";

import { useCallback, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { SendRequest } from "@/lib/meetings/audience";
import type { MeetingView } from "@/lib/meetings/view";
import { AgendaAccount } from "./AgendaAccount";
import { ChooseMeetingsDialog } from "./ChooseMeetingsDialog";
import { InviteDialog } from "./InviteDialog";
import { JoinOptions } from "./JoinOptions";
import { MeetingHistory } from "./MeetingHistory";
import { SendMinutesDialog } from "./SendMinutesDialog";
import { useAgenda } from "./useAgenda";
import { useMeetings } from "./useMeetings";

const report = (task: Promise<void>) => void task.catch((e: Error) => toast.error(e.message));

export function ExpertMeetings({ agentId, profile, expertName }: { agentId: string; profile: string; expertName: string }) {
  const meetings = useMeetings(agentId, profile);
  const agenda = useAgenda(agentId, profile, meetings.reload);
  const [inviting, setInviting] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [sending, setSending] = useState<MeetingView | null>(null);
  const { sendOptions, send } = meetings;
  const sendingId = sending?.id ?? null;

  const loadOptions = useCallback(() => sendOptions(sendingId ?? ""), [sendOptions, sendingId]);
  const sendMinutes = useCallback((request: SendRequest) => send(sendingId ?? "", request), [send, sendingId]);

  return (
    <div className="flex flex-col gap-6">
      <AgendaAccount view={agenda.view} error={agenda.error} busy={agenda.settling} onChange={(account) => report(agenda.setCalendar(account))} />

      <JoinOptions
        expertName={expertName}
        view={agenda.view}
        settling={agenda.settling}
        isOn={agenda.isOn}
        onInvite={() => setInviting(true)}
        onAll={(all) => report(agenda.setAll(all))}
        onChoose={() => setChoosing(true)}
      />

      {meetings.error && <p className="text-sm text-ko">{meetings.error}</p>}
      {meetings.items ? (
        <MeetingHistory
          expertName={expertName}
          items={meetings.items}
          hasMore={meetings.hasMore}
          more={meetings.more}
          search={meetings.search}
          onSend={setSending}
          onRewrite={meetings.rewrite}
        />
      ) : (
        !meetings.error && (
          <p className="flex items-center justify-center gap-2 py-6 text-sm text-ink-3">
            <Loader2 className="size-4 animate-spin" /> Chargement…
          </p>
        )
      )}

      <InviteDialog open={inviting} onOpenChange={setInviting} expertName={expertName} onInvite={meetings.start} />
      <ChooseMeetingsDialog
        open={choosing}
        onOpenChange={setChoosing}
        expertName={expertName}
        view={agenda.view}
        settling={agenda.settling}
        isOn={agenda.isOn}
        onToggle={(key) => report(agenda.toggle(key))}
      />
      <SendMinutesDialog
        open={sending !== null}
        onOpenChange={(open) => !open && setSending(null)}
        expertName={expertName}
        contacts={sending?.minutes?.contacts ?? []}
        loadOptions={loadOptions}
        onSend={sendMinutes}
      />
    </div>
  );
}
