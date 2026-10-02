// The per-agent tab grammar, shared by the server route guard
// (src/app/(app)/experts/[agentId]/[[...onglet]]/page.tsx) and the client SPA
// (src/components/AgentWorkspace.tsx) so the two can't drift. The active expert is
// bound to the URL: /experts/{agentId}/{onglet}.
//
// Les identifiants d'onglet restent en anglais pour l'instant : les maquettes en
// prévoient treize, aux noms différents (discussion, résumé, connecteurs, canaux…).
// Ils seront repris en bloc au lot « espace expert », pas deux fois.

export const AGENT_TAB_IDS = ["chat", "files", "messaging", "integrations", "settings"] as const;

export type AgentTab = (typeof AGENT_TAB_IDS)[number];

function isAgentTab(value: string): value is AgentTab {
  return (AGENT_TAB_IDS as readonly string[]).includes(value);
}

// The canonical path for an agent's tab. The active agent rides the URL as a path
// segment so deep-links, refresh, and the Back button all reopen the same agent + tab.
export function agentTabPath(agentId: string, tab: AgentTab): string {
  return `/experts/${agentId}/${tab}`;
}

// Parse the optional catch-all segments after /experts/{agentId} into a tab,
// or null for shapes that should 404. No segments => the default "chat" tab; exactly one
// valid tab segment => that tab; anything else (unknown tab, extra segments) => null.
export function parseAgentTab(segments?: string[]): AgentTab | null {
  if (!segments || segments.length === 0) return "chat";
  if (segments.length === 1 && isAgentTab(segments[0])) return segments[0];
  return null;
}
