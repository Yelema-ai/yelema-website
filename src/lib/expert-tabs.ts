import { isProfileId } from "@/lib/profile-id";

// The expert route's grammar, shared by the server route guard
// (src/app/(app)/experts/[agentId]/[[...onglet]]/page.tsx) and the client SPA
// (src/components/AgentWorkspace.tsx) so the two can't drift. The instance and the expert both
// ride the URL: /experts/{agentId}/{profileId}/{onglet}. Without a profile segment
// (/experts/{agentId}/{onglet}) the page is the instance's default home, no persona.
//
// Les identifiants d'onglet restent en anglais pour l'instant : les maquettes en
// prévoient treize, aux noms différents (discussion, résumé, connecteurs, canaux…).
// Ils seront repris en bloc au lot « espace expert », pas deux fois.

export const AGENT_TAB_IDS = ["chat", "files", "messaging", "integrations", "settings"] as const;

export type AgentTab = (typeof AGENT_TAB_IDS)[number];

function isAgentTab(value: string): value is AgentTab {
  return (AGENT_TAB_IDS as readonly string[]).includes(value);
}

// The canonical path for a tab of an expert (or of the instance's default home when `profileId` is
// null). Both ride the URL as path segments so deep-links, refresh, and the Back button all reopen
// the same expert + tab.
export function agentTabPath(agentId: string, tab: AgentTab, profileId?: string | null): string {
  return profileId ? `/experts/${agentId}/${profileId}/${tab}` : `/experts/${agentId}/${tab}`;
}

export interface AgentRoute {
  profileId: string | null;
  tab: AgentTab;
}

// Parse the optional catch-all segments after /experts/{agentId}, or null for shapes that should
// 404. A lone segment is a tab when it names one, otherwise a profile (so a profile can't be called
// "chat", "files"…; profiles are named client__expert, so that never happens).
export function parseAgentRoute(segments?: string[]): AgentRoute | null {
  const [first, second, ...rest] = segments ?? [];
  if (rest.length > 0) return null;
  if (first === undefined) return { profileId: null, tab: "chat" };
  if (second === undefined) {
    if (isAgentTab(first)) return { profileId: null, tab: first };
    return isProfileId(first) ? { profileId: first, tab: "chat" } : null;
  }
  return isProfileId(first) && !isAgentTab(first) && isAgentTab(second) ? { profileId: first, tab: second } : null;
}
