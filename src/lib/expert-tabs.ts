import { isProfileId } from "@/lib/profile-id";

// The expert route's grammar, shared by the server route guard
// (src/app/(app)/experts/[agentId]/[[...onglet]]/page.tsx) and the client SPA
// (src/components/AgentWorkspace.tsx) so the two can't drift. The instance and the expert both
// ride the URL: /experts/{agentId}/{profileId}/{onglet}. Without a profile segment
// (/experts/{agentId}/{onglet}) the page is the instance's default home, no persona.
//
// Les identifiants d'onglet restent en anglais pour l'instant : les maquettes en
// prévoient d'autres, aux noms différents (discussion, résumé…). Ils seront repris en bloc au
// lot « espace expert », pas deux fois.

export const AGENT_TAB_IDS = ["chat", "files", "routines", "tools", "emails", "calls"] as const;

// Connecteurs and Canaux used to be tabs of every expert. They are set once for the instance, so
// they live in the Administration; an old address is sent there.
const MOVED_TABS: Record<string, string> = {
  integrations: "/integrations/connecteurs",
  messaging: "/integrations/canaux",
};

// Where an expert address that ends on a moved tab now leads, or null.
export function movedTabPath(segments?: string[]): string | null {
  const last = segments?.at(-1);
  return last !== undefined && segments!.length <= 2 ? (MOVED_TABS[last] ?? null) : null;
}

export type AgentTab = (typeof AGENT_TAB_IDS)[number];

function isAgentTab(value: string): value is AgentTab {
  return (AGENT_TAB_IDS as readonly string[]).includes(value);
}

// The canonical path for a tab of an expert (or of the instance's default home when `profileId` is
// null). Both ride the URL as path segments so deep-links, refresh, and the Back button all reopen
// the same expert + tab.
export function agentTabPath(agentId: string, tab: AgentTab, profileId?: string | null): string {
  return profileId ? `${expertPath(agentId, profileId)}/${tab}` : `/experts/${agentId}/${tab}`;
}

// A team member's copy (`u-k3x9q2__mamadou`) shows as its expert's key; the page maps it back.
const COPY = /^u-[a-z0-9]{6}__(.+)$/;
export const urlProfile = (profileId: string): string => COPY.exec(profileId)?.[1] ?? profileId;
export const expertPath = (agentId: string, profileId: string): string => `/experts/${agentId}/${urlProfile(profileId)}`;

// The installed profile a URL segment names: itself, or the member's copy of that expert.
export function resolveProfile(segment: string, profiles: readonly string[]): string | null {
  if (profiles.includes(segment)) return segment;
  return profiles.find((p) => COPY.test(p) && urlProfile(p) === segment) ?? null;
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
