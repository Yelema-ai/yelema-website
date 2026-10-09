"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { FolderOpen, MessageSquare, Repeat } from "lucide-react";
import { agentTabPath, parseAgentRoute, type AgentTab } from "@/lib/expert-tabs";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { useMyAgents } from "@/components/useMyAgents";
import { ExpertAvatar } from "@/components/experts/ExpertAvatar";
import { ExpertImage } from "@/components/experts/ExpertImage";
import { ExpertRoutines } from "@/components/experts/ExpertRoutines";
import { useExpertsContext } from "@/components/experts/ExpertsProvider";
import { useCatalogueExpert } from "@/components/experts/useCatalogue";
import { expertDisplayName } from "@/lib/experts";
import { DRIVE_ROOT } from "@/lib/drive-paths";
import { ChatProvider } from "@/components/chat/ChatProvider";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ChatView } from "@/components/chat/ChatView";
import { FilesTab } from "@/components/files/FilesTab";
import { cn } from "@/lib/utils";

const TABS: { id: AgentTab; label: string; icon: typeof MessageSquare }[] = [
  { id: "chat", label: "Discussion", icon: MessageSquare },
  { id: "files", label: "Livrables", icon: FolderOpen },
  { id: "routines", label: "Routines", icon: Repeat },
];

// The per-expert tabbed SPA, laid out as a SINGLE left rail + the active tab's pane. The instance
// (agentId) and the expert (profileId, a Hermes profile on that instance; null = its default home)
// are bound to the URL; the open tab rides the URL as a path segment. Tabs switch via
// history.pushState (no full navigation) so Chat's in-flight stream and Files' current directory
// survive moving between tabs — those two mount lazily then stay MOUNTED-BUT-HIDDEN; Routines
// mount lazily in the scroll area. Connecteurs and Canaux are not here: they are set once for the
// instance, in the Administration. There is no settings tab: the instance (its size, its own
// dashboard and terminal, its budget) is run by Yelema from the back office, not by the member.
//
// ChatProvider wraps the WHOLE workspace (not just the Chat pane) so the "Chats" thread list can live
// in this one sidebar — folded in under the nav on the Chat tab — instead of a second rail. The chat
// thread also stays open (and streaming) while you visit Livrables or Routines because the
// provider and ChatView never unmount.
export function AgentWorkspace({
  agentId,
  profileId,
  workspaceId,
  initialTab,
}: {
  agentId: string;
  profileId: string | null;
  workspaceId: string;
  initialTab: AgentTab;
}) {
  const pathname = usePathname();
  const { setCurrentId } = useWorkspace();

  // Deep-linking to an agent scopes the WorkspaceProvider to its workspace, so the fleet/switcher
  // and any workspace-derived UI stay in sync after a refresh or shared link.
  useEffect(() => {
    setCurrentId(workspaceId);
  }, [workspaceId, setCurrentId]);

  // The user's instances with their live state, which the chat needs (its model list, whether the
  // image streams a screen).
  const { agents } = useMyAgents(workspaceId);

  // The expert this page is about, dressed by the catalogue; its own folder is where Livrables opens.
  const { experts } = useExpertsContext();
  const expert = experts.find((e) => e.agentId === agentId && e.profileId === profileId) ?? null;
  const driveFolder = expert?.driveFolder ? `${DRIVE_ROOT}/${expert.driveFolder}` : undefined;
  // Routines belong to an expert's profile: the instance's default home has none here.
  const tabs = profileId ? TABS : TABS.filter((t) => t.id !== "routines");
  const sheet = useCatalogueExpert(expert?.catalogueKey);
  const expertName = expert?.displayName ?? (profileId ? expertDisplayName(profileId) : "");
  // The rail's picture: the face, or the full-body portrait cropped to it.
  const portrait = expert?.photoUrl ?? (sheet ? sheet.portraitUrl : null);

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
        <aside className="hidden w-[262px] shrink-0 flex-col gap-1 overflow-y-auto border-r border-line bg-surface px-3 py-3.5 lg:flex">
          {expert && (
            <>
              {/* Fixed colors on purpose: a picture with white text over it, in both themes. */}
              <div className="relative isolate aspect-[1/1.02] shrink-0 overflow-hidden rounded-[22px] bg-[#8E6FB0] text-white">
                {portrait && <ExpertImage src={portrait} sizes="238px" className="-z-20 object-cover object-[50%_15%]" />}
                <div className="absolute inset-0 -z-10 bg-gradient-to-b from-transparent from-45% to-[rgba(8,5,16,.82)]" />
                <div className="absolute inset-x-3 bottom-3">
                  <p className="text-[17px] font-bold">{expert.displayName}</p>
                  {expert.role && <p className="text-[11px] font-semibold uppercase tracking-[0.06em] opacity-85">{expert.role}</p>}
                </div>
              </div>
              {expert.tagline && <p className="px-1.5 pb-1 pt-2 text-[13px] text-ink-3">{expert.tagline}</p>}
            </>
          )}
          <nav className="flex flex-col gap-0.5">
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
                    "flex min-h-10 items-center gap-2.5 rounded-[11px] px-2.5 text-left text-sm font-semibold transition-colors",
                    isActive ? "bg-soft-2 text-ink" : "text-ink-2 hover:bg-soft"
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" />
                  {t.label}
                </button>
              );
            })}
          </nav>

          {/* The thread list folds into this one rail on the Chat tab (no second sidebar). */}
          {isChat && (
            <div className="mt-3 flex min-h-[200px] flex-1 flex-col border-t border-line pt-3">
              <ChatSidebar />
            </div>
          )}
        </aside>

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Phones and tablets: the rail folds into a header with tab pills. */}
          <nav className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-line bg-surface px-4 py-2.5 lg:hidden">
            {expert && (
              <>
                <ExpertAvatar expert={{ ...expert, gateway: null }} size="sm" />
                <span className="ml-2 mr-2 shrink-0 text-sm font-bold text-ink">{expert.displayName}</span>
              </>
            )}
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => selectTab(t.id)}
                aria-current={currentTab === t.id ? "page" : undefined}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-[13px] font-semibold",
                  currentTab === t.id ? "bg-tint text-brand-ink" : "text-ink-2 hover:bg-soft"
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
          {/* Routines mount lazily in the padded scroll area. */}
          {currentTab === "routines" && profileId && (
            <div className="min-h-0 flex-1 overflow-y-auto">
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
            </div>
          )}
        </main>
      </div>
    </ChatProvider>
  );
}
