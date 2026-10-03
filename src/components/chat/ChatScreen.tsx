"use client";

import { useAgentId } from "@/components/app/AppProvider";
import { ChatProvider, useSessionUrl } from "./ChatProvider";
import { ChatSidebar } from "./ChatSidebar";
import { ChatView } from "./ChatView";

// A full chat for one Hermes profile: the conversation rail beside the conversation.
export function ChatScreen({ profile, initialMessage }: { profile: string; initialMessage?: string | null }) {
  const agentId = useAgentId();
  const [sessionId, navigate] = useSessionUrl();
  return (
    <ChatProvider agentId={agentId} profile={profile} urlSessionId={sessionId} navigateToSession={navigate}>
      <div className="grid h-[calc(100vh-62px)] md:grid-cols-[264px_minmax(0,1fr)]">
        <aside className="hidden flex-col border-r border-line bg-surface px-2.5 py-3 md:flex">
          <ChatSidebar />
        </aside>
        <section className="min-h-0 bg-bg">
          <ChatView initialMessage={initialMessage} />
        </section>
      </div>
    </ChatProvider>
  );
}
