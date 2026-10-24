"use client";

import { useState } from "react";
import { History } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ChatSidebar } from "./ChatSidebar";

// Below a wide screen there is no column of conversations beside the chat: the expert's conversations open in a panel that slides from the left, over the
// chat. Picking or starting a conversation closes it.
export function ChatSessionsPanel() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Conversations"
        title="Conversations"
        className="-ml-1.5 grid size-11 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-soft xl:hidden"
      >
        <History className="h-5 w-5" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          aria-describedby={undefined}
          className="left-0 top-0 flex h-dvh w-[86vw] max-w-[340px] translate-x-0 translate-y-0 flex-col gap-0 rounded-none rounded-r-[22px] border-y-0 border-l-0 px-2 pb-[max(env(safe-area-inset-bottom),12px)] pt-12 data-[state=open]:animate-in data-[state=open]:slide-in-from-left xl:hidden"
        >
          <DialogTitle className="sr-only">Conversations</DialogTitle>
          <ChatSidebar onNavigate={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
