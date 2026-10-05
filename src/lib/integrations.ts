import "server-only";
import { agent37 } from "@/lib/agent37";
import { composioUserId, connectToolkit, deleteConnection, listConnections, listToolkits } from "@/lib/composio";
import type {
  AgentRow,
  IntegrationConnectionsResult,
  IntegrationConnectResult,
  IntegrationToolkitsResult,
} from "@/lib/types";

// The Connecteurs tab's backend, per instance. An instance the back office has wired for Yelema's
// own Composio (agents.apps_token_hash is set: the yelema-hermes image, the `apps` tool server)
// manages its connections there, under the member's identity. Any other instance still runs on
// Agent37's managed Composio, so the tab keeps showing what its experts really use.
function onYelemaComposio(row: AgentRow): boolean {
  return Boolean(row.apps_token_hash);
}

export const integrations = {
  toolkits: (row: AgentRow, search?: string): Promise<IntegrationToolkitsResult> =>
    onYelemaComposio(row) ? listToolkits(search) : agent37.listIntegrationToolkits(row.agent37_id, { search }),

  connect: (row: AgentRow, toolkit: string): Promise<IntegrationConnectResult> =>
    onYelemaComposio(row)
      ? connectToolkit(composioUserId(row), toolkit)
      : agent37.connectIntegration(row.agent37_id, { toolkit }),

  connections: (row: AgentRow): Promise<IntegrationConnectionsResult> =>
    onYelemaComposio(row) ? listConnections(composioUserId(row)) : agent37.listIntegrationConnections(row.agent37_id),

  // Either backend checks that the account belongs to this instance's identity before deleting.
  disconnect: (row: AgentRow, connectedAccountId: string): Promise<unknown> =>
    onYelemaComposio(row)
      ? deleteConnection(composioUserId(row), connectedAccountId)
      : agent37.disconnectIntegration(row.agent37_id, connectedAccountId),
};
