"use client";

import { useAgentId } from "@/components/app/AppProvider";
import { ConnectorsView } from "@/components/integrations/ConnectorsView";

// Paramètres > Connecteurs: the company's tools, shared by every expert on the instance.
export default function ConnecteursPage() {
  const agentId = useAgentId();
  return <ConnectorsView agentId={agentId} />;
}
