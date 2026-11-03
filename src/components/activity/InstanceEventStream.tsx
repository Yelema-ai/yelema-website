"use client";

import { useEffect } from "react";
import { usePublicConfig } from "@/components/PublicConfigProvider";
import { useOwnAgentId } from "@/components/conversations/useAllConversations";
import { driveChanged } from "@/lib/drive-store";
import { INSTANCE_EVENTS, instanceEvents, reconnectDelay } from "@/lib/instance-events";

// One EventSource per tab on the member's instance, only while the tab is visible. A turn ended or a
// file written reads the drive again (the deliverable watcher hears it); every event reaches the hub.
// Cut or refused (429, 404): closed, retried with backoff; meanwhile the polls run as before.
export function InstanceEventStream() {
  const { eventStream } = usePublicConfig();
  const agentId = useOwnAgentId();

  useEffect(() => {
    if (!eventStream || !agentId) return;
    let source: EventSource | null = null;
    let timer: number | undefined;
    let attempt = 0;

    const close = () => {
      source?.close();
      source = null;
      instanceEvents.setConnected(agentId, false);
    };
    const open = () => {
      if (source || document.visibilityState === "hidden") return;
      const es = new EventSource(`/api/agents/${agentId}/events`);
      source = es;
      es.addEventListener("ready", () => {
        attempt = 0;
        instanceEvents.setConnected(agentId, true);
      });
      for (const type of INSTANCE_EVENTS) {
        es.addEventListener(type, () => {
          if (type !== "instance.changed") driveChanged(agentId);
          instanceEvents.emit(agentId, type);
        });
      }
      es.onerror = () => {
        close();
        window.clearTimeout(timer);
        timer = window.setTimeout(open, reconnectDelay(attempt++));
      };
    };
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
