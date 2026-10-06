"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Blocks, FolderOpen, MessageSquare, MessagesSquare, Repeat } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { isTransitional } from "@/lib/format";
import { agentTabPath, parseAgentRoute, type AgentTab } from "@/lib/expert-tabs";
import type { MergedAgent, Role } from "@/lib/types";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { ExpertRoutines } from "@/components/experts/ExpertRoutines";
import { useExpertsContext } from "@/components/experts/ExpertsProvider";
import { useCatalogueExpert } from "@/components/experts/useCatalogue";
import { expertDisplayName } from "@/lib/experts";
import { DRIVE_ROOT } from "@/lib/drive-paths";
import { ConnectorsView } from "@/components/integrations/ConnectorsView";
import { ChannelsTab } from "@/components/channels/ChannelsTab";
import { ChatProvider } from "@/components/chat/ChatProvider";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ChatView } from "@/components/chat/ChatView";
import { FilesTab } from "@/components/files/FilesTab";
import { cn } from "@/lib/utils";

const TABS: { id: AgentTab; label: string; icon: typeof MessageSquare }[] = [
  { id: "chat", label: "Discussion", icon: MessageSquare },
  { id: "files", label: "Livrables", icon: FolderOpen },
  { id: "routines", label: "Routines", icon: Repeat },
  { id: "messaging", label: "Canaux", icon: MessagesSquare },
  { id: "integrations", label: "Connecteurs", icon: Blocks },
];

// The per-expert tabbed SPA, laid out as a SINGLE left rail + the active tab's pane. The instance
// (agentId) and the expert (profileId, a Hermes profile on that instance; null = its default home)
// are bound to the URL; the open tab rides the URL as a path segment. Tabs switch via
// history.pushState (no full navigation) so Chat's in-flight stream and Files' current directory
// survive moving between tabs — those two mount lazily then stay MOUNTED-BUT-HIDDEN; the other tabs
// mount lazily in the scroll area. There is no settings tab: the instance (its size, its own
// dashboard and terminal, its budget) is run by Yelema from the back office, not by the member.
//
// ChatProvider wraps the WHOLE workspace (not just the Chat pane) so the "Chats" thread list can live
// in this one sidebar — folded in under the nav on the Chat tab — instead of a second rail. The chat
// thread also stays open (and streaming) while you visit Files/Integrations/Settings because the
// provider and ChatView never unmount.
export function AgentWorkspace({
  agentId,
  profileId,
  workspaceId,
  role,
  isOwner,
  initialTab,
}: {
  agentId: string;
  profileId: string | null;
  workspaceId: string;
  role: Role;
  isOwner: boolean;
  initialTab: AgentTab;
}) {
  // The page only renders for the agent's owner (see its server check); they
  // operate the agent, only an admin deletes it.
  const canManage = isOwner;
  const pathname = usePathname();
  const { setCurrentId } = useWorkspace();

  // Deep-linking to an agent scopes the WorkspaceProvider to its workspace, so the fleet/switcher
  // and any workspace-derived UI stay in sync after a refresh or shared link.
  useEffect(() => {
    setCurrentId(workspaceId);
  }, [workspaceId, setCurrentId]);

  // Live data for every agent in the workspace: the switcher lists them, and `active` carries this
  // agent's live ports / status / update flag. Poll while any agent is mid-transition (the old fleet view's
  // approach), so a starting agent's ports light up without a manual refresh.
  const [agents, setAgents] = useState<MergedAgent[]>([]);
  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ agents: MergedAgent[]; role: Role }>(
        `/api/agents?workspace=${workspaceId}`
      );
      setAgents(data.agents);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [workspaceId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!agents.some((a) => isTransitional(a.live_status))) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [agents, load]);

  const active = agents.find((a) => a.agent37_id === agentId) ?? null;

  // The expert this page is about, dressed by the catalogue; its own folder is where Livrables opens.
  const { experts } = useExpertsContext();
  const expert = experts.find((e) => e.agentId === agentId && e.profileId === profileId) ?? null;
  const driveFolder = expert?.driveFolder ? `${DRIVE_ROOT}/${expert.driveFolder}` : undefined;
  // Routines belong to an expert's profile: the instance's default home has none here.
  const tabs = profileId ? TABS : TABS.filter((t) => t.id !== "routines");
  const sheet = useCatalogueExpert(expert?.catalogueKey);
  const expertName = expert?.displayName ?? (profileId ? expertDisplayName(profileId) : "");

  // A message typed on the home page rides the URL as ?q= and is sent once the chat is up.
  const [initialMessage] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("q")
  );

  // The open tab follows the URL (history.pushState updates usePathname in the App Router). Fall
  // back to the server-resolved initialTab on the first paint before the path is parsed.
  const segments = pathname.split("/").filter(Boolean); // ["experts", agentId, profileId?, tab?]
  const currentTab = parseAgentRoute(segments.slice(2))?.tab ?? initialTab;
  const isChat = currentTab === "chat";
  const isFiles = currentTab === "files";

  function selectTab(tab: AgentTab) {
    const path = agentTabPath(agentId, tab, profileId);
    if (typeof window !== "undefined" && window.location.pathname !== path) {
      window.history.pushState(null, "", path);
    }
  }

  // The open chat thread rides the URL as `?session=` (a query param — the agent route only accepts
  // 0–1 tab segments). Read it on mount (refresh / shared link) and on Back/Forward (popstate). Lifted
  // here (out of the Chat pane) so ChatProvider can wrap both this rail and the pane.
  const [urlSessionId, setUrlSessionId] = useState<string | null>(null);
  useEffect(() => {
    const read = () => setUrlSessionId(new URLSearchParams(window.location.search).get("session"));
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  const chatPath = agentTabPath(agentId, "chat", profileId);
  // Write the open thread into the chat URL without adding a path segment. pushState for an explicit
  // switch (so Back returns to the previous thread); replaceState when promoting a freshly-minted
  // session or re-stamping the URL on tab return (so Back doesn't bounce through transient states).
  const navigateToSession = useCallback(
    (sessionId: string | null, mode: "push" | "replace" = "push") => {
      const url = sessionId ? `${chatPath}?session=${encodeURIComponent(sessionId)}` : chatPath;
      if (typeof window !== "undefined") {
        if (mode === "replace") window.history.replaceState(null, "", url);
        else window.history.pushState(null, "", url);
      }
      setUrlSessionId(sessionId);
    },
    [chatPath]
  );

  // Latch Chat/Files mounted on first open, then keep them mounted (hidden) across tab switches.
  // Latched during render (not in an effect) so the mount lands in the same pass as the switch.
  const [chatOpened, setChatOpened] = useState(isChat);
  if (isChat && !chatOpened) setChatOpened(true);
  const [filesOpened, setFilesOpened] = useState(isFiles);
  if (isFiles && !filesOpened) setFilesOpened(true);

  return (
    <ChatProvider
      agentId={agentId}
      profile={profileId}
      agents={agents}
      urlSessionId={urlSessionId}
      onChatTab={isChat}
      navigateToSession={navigateToSession}
    >
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-64 shrink-0 flex-col border-r bg-card md:flex">
          <div className="flex flex-col p-4 pb-3">
            <nav className="flex flex-col gap-1">
              {tabs.map((t) => {
                const Icon = t.icon;
                const isActive = currentTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => selectTab(t.id)}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors",
                      isActive
                        ? "bg-secondary text-secondary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {t.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* The "Chats" thread list folds into this one rail on the Chat tab (no second sidebar).
              On other tabs a spacer keeps the account footer pinned to the bottom. */}
          {isChat ? (
            <div className="flex min-h-0 flex-1 flex-col border-t">
              <ChatSidebar />
            </div>
          ) : (
            <div className="flex-1" />
          )}

        </aside>

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* On a phone the rail is hidden: the tabs become a strip above the pane. */}
          <nav className="flex shrink-0 gap-1 overflow-x-auto border-b bg-card px-3 py-2 md:hidden">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => selectTab(t.id)}
                aria-current={currentTab === t.id ? "page" : undefined}
                className={cn(
                  "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium",
                  currentTab === t.id ? "bg-secondary text-secondary-foreground" : "text-muted-foreground"
                )}
              >
                {t.label}
              </button>
            ))}
          </nav>
          {/* Chat owns its full height and stays MOUNTED (just hidden) across tab switches. */}
          {chatOpened && (
            <div className={cn("min-h-0 flex-1", !isChat && "hidden")}>
              <ChatView initialMessage={initialMessage} />
            </div>
          )}
          {/* Files mirrors Chat: full-height, kept MOUNTED so the current directory survives. */}
          {filesOpened && (
            <div className={cn("min-h-0 flex-1", !isFiles && "hidden")}>
              <FilesTab agentId={agentId} initialPath={driveFolder} />
            </div>
          )}
          {/* Routines, Connecteurs and Canaux mount lazily in the padded scroll area. */}
          {!isChat && !isFiles && (
            <div className="min-h-0 flex-1 overflow-y-auto">
              {currentTab === "routines" && profileId ? (
                <div className="mx-auto w-full max-w-4xl p-6 md:px-10 md:py-8">
                  <ExpertRoutines
                    agentId={agentId}
                    expert={{
                      profileId,
                      name: expertName,
                      skills: sheet ? [...sheet.skills.map((s) => s.name), ...sheet.competencies] : [],
                      driveFolder: expert?.driveFolder ?? expertName,
                    }}
                  />
                </div>
              ) : currentTab === "integrations" ? (
                <div className="mx-auto w-full max-w-5xl p-6 md:px-10 md:py-8">
                  <ConnectorsView agentId={agentId} />
                </div>
              ) : (
                <div className="mx-auto w-full max-w-3xl p-6 md:px-10 md:py-8">
                  {active ? (
                    <ChannelsTab agentId={agentId} agent={active} canManage={canManage} />
                  ) : (
                    <p className="text-sm text-muted-foreground">Chargement…</p>
                  )}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </ChatProvider>
  );
}
