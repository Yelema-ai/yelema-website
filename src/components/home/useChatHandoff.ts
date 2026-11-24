"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import type { PrefetchKind } from "next/dist/client/components/router-reducer/router-reducer-types";
import { sparingData } from "@/components/usePrefetch";
import { handoffNote, handoffQuery } from "@/lib/chat-handoff";

// The home's chat bar: `warm` fetches the chat page whole while the member types, `send` opens it on that
// bare path (the note carries the text), so Envoyer costs no server round trip before the chat shows.
export function useChatHandoff(path: string | null) {
  const router = useRouter();
  const warmed = useRef<string | null>(null);
  return {
    warm() {
      if (!path || warmed.current === path || sparingData()) return;
      warmed.current = path;
      router.prefetch(path, { kind: "full" as PrefetchKind });
    },
    send(message: string) {
      const m = message.trim();
      if (!m || !path) return;
      router.push(handoffNote(m, path) ? path : `${path}?${handoffQuery(m)}`);
    },
  };
}
