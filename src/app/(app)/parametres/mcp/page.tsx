"use client";

import { useAgentId } from "@/components/app/AppProvider";
import { McpView } from "@/components/integrations/McpView";

// Paramètres > MCP: manage custom MCP servers connected to the instance.
export default function McpPage() {
  const agentId = useAgentId();
  return <McpView agentId={agentId} />;
}
