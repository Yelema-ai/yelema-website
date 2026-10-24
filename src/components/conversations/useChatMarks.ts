"use client";

import { useCallback, useEffect, useState } from "react";
import { NO_MARKS, parseMarks, setMark, type ChatMarks } from "@/lib/chat-marks";

// Pinned and archived conversations, kept in the browser until the back office stores them (then
// they follow the member to the mobile app). Every list re-reads on the same event, so pinning in
// the rail moves the row in the menu at once.
const KEY = "yelema.chat-marks";
const EVENT = "yelema:chat-marks";

function read(): ChatMarks {
  try {
    return parseMarks(localStorage.getItem(KEY));
  } catch {
    return NO_MARKS;
  }
}

export function useChatMarks() {
  const [marks, setMarks] = useState<ChatMarks>(NO_MARKS);
  useEffect(() => {
    const sync = () => setMarks(read());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const mark = useCallback((key: string, kind: "pinned" | "archived", on: boolean) => {
    const next = setMark(read(), key, kind, on);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // No storage: the mark lasts for this page.
    }
    setMarks(next);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return { marks, mark };
}
