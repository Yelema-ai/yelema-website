"use client";

import { useEffect } from "react";
import { useOwnAgentId } from "@/components/conversations/useAllConversations";
import { DEFAULT_QUERY } from "@/lib/analytics/query";
import { whenIdle } from "@/components/usePrefetch";
import { loadAnalytics } from "./useAnalytics";

// Charge l'analytique de l'instance du membre, requête par défaut, une fois le premier écran servi (jamais devant lui).
export function AnalyticsReadAhead() {
  const ownAgentId = useOwnAgentId();

  useEffect(() => {
    if (ownAgentId) whenIdle(() => void loadAnalytics(ownAgentId, DEFAULT_QUERY).catch(() => {}));
  }, [ownAgentId]);

  return null;
}
