"use client";

import { useSearchParams } from "next/navigation";
import { Phone, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { ExpertCalls } from "@/components/voice/ExpertCalls";
import { ExpertMeetings } from "./ExpertMeetings";

const VIEW_PARAM = "vue";
const MEETINGS_VIEW = "reunions";

type Callee = { key: string; name: string; photoUrl: string | null };

function selectView(view: "calls" | "meetings") {
  const url = new URL(window.location.href);
  url.searchParams.delete("appel");
  if (view === "meetings") url.searchParams.set(VIEW_PARAM, MEETINGS_VIEW);
  else url.searchParams.delete(VIEW_PARAM);
  window.history.pushState(null, "", url.pathname + url.search);
}

function Toggle({ on, label, icon: Icon, onSelect }: { on: boolean; label: string; icon: typeof Phone; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      onClick={onSelect}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-[14px] text-[14px] font-semibold transition-colors",
        on ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink"
      )}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}

export function CallsAndMeetings({
  agentId,
  profile,
  callee,
  calls,
  meetings,
}: {
  agentId: string;
  profile: string | null;
  callee: Callee;
  calls: boolean;
  meetings: boolean;
}) {
  const asked = useSearchParams().get(VIEW_PARAM) === MEETINGS_VIEW;
  const showMeetings = meetings && profile !== null && (asked || !calls);
  return (
    <div className="flex flex-col gap-5">
      {calls && meetings && profile && (
        <div role="tablist" aria-label="Appels et réunions" className="grid grid-cols-2 rounded-2xl bg-soft p-1">
          <Toggle on={!showMeetings} label="Appels" icon={Phone} onSelect={() => selectView("calls")} />
          <Toggle on={showMeetings} label="Réunions" icon={Users} onSelect={() => selectView("meetings")} />
        </div>
      )}
      {showMeetings && profile ? <ExpertMeetings agentId={agentId} profile={profile} expertName={callee.name} /> : calls ? <ExpertCalls expert={callee} /> : null}
    </div>
  );
}
