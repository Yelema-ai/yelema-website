import "server-only";
import { agent37 } from "@/lib/agent37";
import { backoffice } from "@/lib/backoffice";
import { composioUserId, connectToolkit, deleteConnection, listConnections, listToolkits } from "@/lib/composio";
import { withAccountDetails } from "@/lib/connection-accounts";
import { ApiError } from "@/lib/http";
import { authViaBackoffice } from "@/lib/runtime-config";
import { readSession } from "@/lib/session";
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

// The member's session for the back office, when it keeps the accounts' details; null otherwise.
async function boToken(row: AgentRow): Promise<string | null> {
  if (!onYelemaComposio(row) || !authViaBackoffice()) return null;
  return (await readSession())?.accessToken ?? null;
}

// Composio's list, with what the back office keeps (e-mail, label, default, author). Without it the list still shows.
// Both are asked at once (Leslie, 28/10: « connecté, pas connecté » shows late), not one after the other.
async function connectionsWithDetails(row: AgentRow): Promise<IntegrationConnectionsResult> {
  const details = boToken(row)
    .then((token) => (token ? backoffice.connectorAccounts(token).then((r) => r.accounts) : null))
    .catch((e) => {
      console.warn("[integrations] account details unavailable:", e instanceof Error ? e.message : e);
      return null;
    });
  const [result, accounts] = await Promise.all([listConnections(composioUserId(row)), details]);
  return accounts ? { connections: withAccountDetails(result.connections, accounts) } : result;
}

// The back office notes who added the account; a miss only loses the author, never the connection.
async function connectAndRecord(row: AgentRow, toolkit: string, alias?: string): Promise<IntegrationConnectResult> {
  const started = await connectToolkit(composioUserId(row), toolkit, alias);
  const token = await boToken(row);
  if (token && started.connectedAccountId) {
    await backoffice
      .recordConnectorAccount(token, { connectedAccountId: started.connectedAccountId, toolkit })
      .catch((e) => console.warn("[integrations] author not recorded:", e instanceof Error ? e.message : e));
  }
  return started;
}

export const integrations = {
  toolkits: (row: AgentRow, search?: string): Promise<IntegrationToolkitsResult> =>
    onYelemaComposio(row) ? listToolkits(search) : agent37.listIntegrationToolkits(row.agent37_id, { search }),

  connect: (row: AgentRow, toolkit: string, alias?: string): Promise<IntegrationConnectResult> =>
    onYelemaComposio(row) ? connectAndRecord(row, toolkit, alias) : agent37.connectIntegration(row.agent37_id, { toolkit, alias }),

  connections: (row: AgentRow): Promise<IntegrationConnectionsResult> =>
    onYelemaComposio(row) ? connectionsWithDetails(row) : agent37.listIntegrationConnections(row.agent37_id),

  // Either backend checks that the account belongs to this instance's identity before deleting.
  disconnect: (row: AgentRow, connectedAccountId: string): Promise<unknown> =>
    onYelemaComposio(row)
      ? deleteConnection(composioUserId(row), connectedAccountId)
      : agent37.disconnectIntegration(row.agent37_id, connectedAccountId),

  // Label and default live in the back office, for the member's own accounts on Yelema's Composio only.
  async updateAccount(row: AgentRow, connectedAccountId: string, body: { label?: string | null; isDefault?: boolean }): Promise<unknown> {
    const token = await boToken(row);
    if (!token) throw new ApiError(404, "not_found", "Le nom et le compte par défaut ne sont pas disponibles pour cet espace.");
    return backoffice.updateConnectorAccount(token, connectedAccountId, body);
  },
};
