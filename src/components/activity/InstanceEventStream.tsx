"use client";

import { useEffect } from "react";
import { usePublicConfig } from "@/components/PublicConfigProvider";
import { useOwnAgentId } from "@/components/conversations/useAllConversations";
import { bootstrapOwner } from "@/lib/bootstrap-client";
import { driveAnswered, driveChanged } from "@/lib/drive-store";
import { INSTANCE_EVENTS, instanceEvents, parseInstanceEvent, reconnectDelay, silenceMs, touchesDrive, touchesSessions, type InstanceEvent } from "@/lib/instance-events";
import { RECENT_RUN_MS } from "@/lib/poll";
import { sessionsStore } from "@/lib/sessions-client";

// Past this, the gateway replays nothing (contract §1): the tab reads everything again itself.
const REPLAY_MS = 60_000;

// One EventSource per tab on the member's instance, only while the tab is visible. Each event reaches
// the hub, the conversations and the drive; a reconnect resumes from the last id it saw. Cut, refused
// (429, 404) or silent past STREAM_SILENCE_MS (a half-open line; longer while it never pinged): closed, retried with backoff; meanwhile
// the gated polls run as their safety net.
export function InstanceEventStream() {
  const { eventStream } = usePublicConfig();
  const agentId = useOwnAgentId();
  // Reads of another instance (a team's expert) need not wait for the bootstrap.
  useEffect(() => bootstrapOwner(agentId), [agentId]);

  useEffect(() => {
    if (!eventStream || !agentId) return;
    let source: EventSource | null = null;
    let timer: number | undefined;
    let silence: number | undefined;
    let attempt = 0;
    let lastId: string | null = null;
    let opened = false;
    let downAt = Date.now();

    // A catch-up of the tab's own (`resumed`) leaves alone what the polls read again on return, just now.
    const dispatch = (e: InstanceEvent) => {
      instanceEvents.emit(agentId, e);
      const recent = e.resumed ? RECENT_RUN_MS : 0;
      if (touchesSessions(e)) sessionsStore.invalidate(agentId, e.type === "instance.changed" ? undefined : e.profile, { answeredWithinMs: recent });
      if (touchesDrive(e, instanceEvents.heard(agentId, "files.changed")) && !(recent && driveAnswered(agentId, recent))) driveChanged(agentId);
    };
    const close = () => {
      window.clearTimeout(silence);
      if (source) downAt = Date.now();
      source?.close();
      source = null;
      instanceEvents.setConnected(agentId, false);
    };
    const open = () => {
      if (source || document.visibilityState === "hidden") return;
      const es = new EventSource(`/api/agents/${agentId}/events${lastId ? `?lastEventId=${encodeURIComponent(lastId)}` : ""}`);
      source = es;
      let pinged = false;
      const heard = () => {
        window.clearTimeout(silence);
        silence = window.setTimeout(retry, silenceMs(pinged));
      };
      heard();
      es.addEventListener("ping", () => {
        pinged = true;
        heard();
      });
      es.addEventListener("ready", () => {
        heard();
        attempt = 0;
        instanceEvents.setConnected(agentId, true);
        // A gateway that gives no ids cannot replay: what happened while cut is read again.
        if (opened && (!lastId || Date.now() - downAt > REPLAY_MS)) dispatch({ type: "instance.changed", at: Date.now(), resumed: true });
        opened = true;
      });
      for (const type of INSTANCE_EVENTS) {
        es.addEventListener(type, (ev) => {
          heard();
          const m = ev as MessageEvent<string>;
          if (m.lastEventId) lastId = m.lastEventId;
          const e = parseInstanceEvent(type, m.data);
          if (e) dispatch(e);
        });
      }
      es.onerror = retry;
    };
    function retry() {
      close();
      window.clearTimeout(timer);
      timer = window.setTimeout(open, reconnectDelay(attempt++));
    }
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        window.clearTimeout(timer);
        close();
      } else open();
    };

    open();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      close();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [eventStream, agentId]);

  return null;
}
