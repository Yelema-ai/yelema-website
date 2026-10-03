import { ChatScreen } from "@/components/chat/ChatScreen";

// Chat entreprise: a plain Hermes chat on the instance's default profile, no persona.
export default async function BusinessChatPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return <ChatScreen profile="default" initialMessage={q ?? null} />;
}
