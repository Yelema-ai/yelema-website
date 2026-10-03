"use client";

import { useAgentId } from "@/components/app/AppProvider";
import { ChannelsView } from "@/components/channels/ChannelsView";

// Paramètres > Canaux: talk to the experts from Telegram or WhatsApp.
export default function CanauxPage() {
  const agentId = useAgentId();
  return <ChannelsView agentId={agentId} />;
}
