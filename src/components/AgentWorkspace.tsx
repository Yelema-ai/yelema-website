"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, FolderOpen, Mail, MessageSquare, Pencil, Repeat, Phone } from "lucide-react";
import { agentTabPath, parseAgentRoute, type AgentTab } from "@/lib/expert-tabs";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { useMyAgents } from "@/components/useMyAgents";
import { ExpertAvatar } from "@/components/experts/ExpertAvatar";
import { ExpertEditModal } from "@/components/experts/ExpertEditModal";
import { usePublicConfig } from "@/components/PublicConfigProvider";
import { ExpertEmails } from "@/components/experts/ExpertEmails";
import { ExpertRoutines } from "@/components/experts/ExpertRoutines";
import { ExpertReadiness } from "@/components/experts/ExpertReadiness";
import { useExpertsContext } from "@/components/experts/ExpertsProvider";
import { useCatalogueExpert } from "@/components/experts/useCatalogue";
import { useMailInboxes } from "@/components/experts/useMailInboxes";
import { expertDisplayName } from "@/lib/experts";
import { DRIVE_ROOT } from "@/lib/drive-paths";
import { ChatProvider } from "@/components/chat/ChatProvider";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ChatView } from "@/components/chat/ChatView";
import { FilesTab } from "@/components/files/FilesTab";
import { cn } from "@/lib/utils";
import { CallButton } from "@/components/voice/CallButton";
import { VoiceButton } from "@/components/voice/VoiceButton";
import { ExpertCalls } from "@/components/voice/ExpertCalls";
import { useVoices } from "@/components/voice/useVoices";

const TABS: { id: AgentTab; label: string; icon: typeof MessageSquare }[] = [
  { id: "chat", label: "Discussion", icon: MessageSquare },
  { id: "calls", label: "Appels", icon: Phone },
  { id: "emails", label: "E-mails", icon: Mail },
  { id: "files", label: "Livrables", icon: FolderOpen },
  { id: "routines", label: "Routines", icon: Repeat },
];

// The per-expert tabbed SPA, laid out as a SINGLE left rail + the active tab's pane. The instance
// (agentId) and the expert (profileId, a Hermes profile on that instance; null = its default home)
// are bound to the URL; the open tab rides the URL as a path segment. Tabs switch via
// history.pushState (no full navigation) so Chat's in-flight stream and Files' current directory
// survive moving between tabs — those two mount lazily then stay MOUNTED-BUT-HIDDEN; Routines
// and E-mails mount lazily in the scroll area. Connecteurs and Canaux are not here: they are set once for the
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
  const router = useRouter();
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
  // The expert's own inbox, when the back office gives this member one to read.
  const mail = useMailInboxes();
  const inbox = (expert?.catalogueKey && mail.inboxes.find((i) => i.expert === expert.catalogueKey)) || null;
  const copyAddress = () => {
    if (!inbox) return;
    navigator.clipboard.writeText(inbox.address).then(
      () => toast.success("Adresse e-mail copiée."),
      () => toast.error("L’adresse n’a pas pu être copiée.")
    );
  };
  // Routines belong to an expert's profile: the instance's default home has none here. E-mails show
  // only for an expert that has an inbox.
  // Calls are offered where voice is on, for an expert of the catalogue.
  const voiceOn = useVoices().length > 0;
  const tabs = TABS.filter((t) => (t.id === "routines" ? profileId !== null : t.id === "emails" ? inbox !== null : t.id === "calls" ? voiceOn && Boolean(expert?.catalogueKey) : true));
  const sheet = useCatalogueExpert(expert?.catalogueKey);
  const expertName = expert?.displayName ?? (profileId ? expertDisplayName(profileId) : "");
  // The face for a call: the photo, or the full-body portrait cropped to it.
  const portrait = expert?.photoUrl ?? (sheet ? sheet.portraitUrl : null);
  // Only an expert of the catalogue can be called: the back office opens the call by its key.
  const callee = expert?.catalogueKey ? { key: expert.catalogueKey, name: expertName, photoUrl: portrait } : null;

  // A message typed on the home page rides the URL as ?q= and is sent once the chat is up. Read once
  // mounted, like ?session= below: on a client navigation from the home page the first render still
  // sees the home page's URL, so reading it during render lost the message.
  const [initialMessage, setInitialMessage] = useState<string | null>(null);
  useEffect(() => setInitialMessage(new URLSearchParams(window.location.search).get("q")), []);

  // The open tab follows the URL (history.pushState updates usePathname in the App Router). Fall
  // back to the server-resolved initialTab on the first paint before the path is parsed.
  const segments = pathname.split("/").filter(Boolean); // ["experts", agentId, profileId?, tab?]
  const currentTab = parseAgentRoute(segments.slice(2))?.tab ?? initialTab;
  // Outils has no tab any more (Leslie, 23/10): an old address to it opens the Discussion.
  useEffect(() => {
    if (currentTab === "tools") window.history.replaceState(null, "", agentTabPath(agentId, "chat", profileId));
  }, [currentTab, agentId, profileId]);
  const isChat = currentTab === "chat" || currentTab === "tools";
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

  // Its member may rename it and change its picture, where the back office keeps them.
  const canEdit = usePublicConfig().authVia === "backoffice" && !!expert?.catalogueKey;
  const [editOpen, setEditOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  // The phone's tab pills scroll: the current one is brought into view.
  const pillsRef = useRef<HTMLElement>(null);
  useEffect(() => {
    pillsRef.current?.querySelector<HTMLElement>("[aria-current=page]")?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [currentTab]);

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
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* The expert heads the page, on a computer as on a phone: who (photo with its state dot,
              the pencil to personalise it), the address to copy, Appeler; then the tabs in one row.
              Nothing is cut: the header shrinks the name, never a button. */}
          <div className="shrink-0 border-b border-line bg-surface">
            {expert && (
              <div className="flex items-center gap-2.5 px-4 pb-1 pt-2.5 lg:gap-4 lg:px-8 lg:pb-3 lg:pt-5">
                <span className="relative shrink-0">
                  <ExpertAvatar expert={expert} size="sm" className="lg:hidden" />
                  <ExpertAvatar expert={expert} size="lg" className="max-lg:hidden" />
                  {(canEdit || (callee && voiceOn)) && (
                    <button
                      type="button"
                      onClick={() => (canEdit ? setEditOpen(true) : setVoiceOpen(true))}
                      title={`Personnaliser ${expertName}`}
                      aria-label={`Personnaliser ${expertName}`}
                      className="absolute -bottom-0.5 -right-0.5 grid size-4 place-items-center lg:-bottom-1 lg:-right-1 rounded-full bg-ink text-surface ring-2 ring-surface hover:opacity-85 lg:size-7"
                    >
                      <Pencil className="size-2 lg:size-3.5" />
                    </button>
                  )}
                </span>
                <span className="ml-0.5 min-w-0 flex-1">
                  <span className="block truncate font-display text-sm font-bold leading-tight text-ink lg:text-[28px]">{expert.displayName}</span>
                  <span className="mt-0.5 flex min-w-0 items-center gap-3 text-[10px] text-ink-3 lg:mt-1 lg:text-[14px]">
                    {expert.role && <span className="truncate max-lg:hidden">{expert.role}</span>}
                    {inbox && (
                      <button
                        type="button"
                        onClick={copyAddress}
                        title="Copier l’adresse e-mail"
                        className="flex min-w-0 items-center gap-1.5 text-left hover:text-ink"
                      >
                        <Mail className="size-3.5 shrink-0 max-lg:hidden" />
                        <span className="truncate">{inbox.address}</span>
                        <Copy className="size-3 shrink-0" />
                      </button>
                    )}
                  </span>
                </span>
                {profileId && <ExpertReadiness agentId={agentId} profileId={profileId} expertName={expertName} onOpenTools={() => router.push("/integrations/connecteurs")} className="shrink-0" />}
                {callee && <CallButton expert={callee} iconOnly className="size-11 shrink-0 rounded-full lg:hidden" />}
                {callee && <CallButton expert={callee} className="h-11 shrink-0 rounded-full bg-brand px-5 text-[15px] text-on-brand hover:bg-brand/90 max-lg:hidden" />}
              </div>
            )}
            <nav ref={pillsRef} className="flex items-center gap-1 overflow-x-auto px-4 py-2 max-lg:[mask-image:linear-gradient(to_right,black_82%,transparent)] [scrollbar-width:none] lg:gap-2 lg:px-8 lg:py-0 [&::-webkit-scrollbar]:hidden">
              {tabs.map((t) => {
                const Icon = t.icon;
                const on = currentTab === t.id || (t.id === "chat" && isChat);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => selectTab(t.id)}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "min-h-9 shrink-0 rounded-full px-3 py-1.5 text-[13px] font-semibold lg:-mb-px lg:inline-flex lg:min-h-12 lg:items-center lg:gap-2 lg:rounded-none lg:border-b-2 lg:px-2 lg:text-[15px]",
                      on ? "bg-tint text-brand-ink lg:border-brand lg:bg-transparent" : "text-ink-2 hover:bg-soft lg:border-transparent lg:hover:bg-transparent lg:hover:text-ink"
                    )}
                  >
                    <Icon className="size-[18px] max-lg:hidden" />
                    {t.label}
                  </button>
                );
              })}
            </nav>
            {callee && voiceOn && <VoiceButton expert={callee} open={voiceOpen} onOpenChange={setVoiceOpen} />}
          </div>
          {/* Chat owns its full height and stays MOUNTED (just hidden) across tab switches. */}
          {chatOpened && (
            <div className={cn("relative flex min-h-0 flex-1", !isChat && "hidden")}>
              {/* The conversations open in their own column beside the chat from « Conversations » under
                  Discussion, and close to give the chat its whole width (phones and tablets: a panel).
                  Under 1280 px a column would leave the chat a strip: it floats over the chat instead,
                  like the phone's panel, and closes once a conversation is picked. */}
              {/* The conversations of this space, always beside the chat on a wide screen (search, Tout /
                  Non lues / Routines, periods). Narrower, the chat's header opens them in a panel. */}
              <div className="hidden w-[288px] shrink-0 flex-col border-r border-line bg-surface px-2.5 py-3 xl:flex">
                <ChatSidebar />
              </div>
              <div className="min-w-0 flex-1">
                <ChatView initialMessage={initialMessage} driveFolder={driveFolder ?? (profileId ? `${DRIVE_ROOT}/${expertName}` : DRIVE_ROOT)} />
              </div>
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
          {currentTab === "calls" && callee && (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-4xl p-6 md:px-10 md:py-8">
                <ExpertCalls expert={callee} />
              </div>
            </div>
          )}
          {currentTab === "emails" && profileId && (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-4xl p-6 md:px-10 md:py-8">
                <ExpertEmails inbox={inbox} expertName={expertName} loaded={mail.loaded} />
              </div>
            </div>
          )}
        </main>
      </div>
      {canEdit && expert?.catalogueKey && (
        <ExpertEditModal
          expertKey={expert.catalogueKey}
          open={editOpen}
          onOpenChange={setEditOpen}
          onVoice={callee && voiceOn ? () => setVoiceOpen(true) : undefined}
        />
      )}
    </ChatProvider>
  );
}
