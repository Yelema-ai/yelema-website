"use client";

import Link from "next/link";
import { FileText, FolderOpen, Mail, MessageCircle, Repeat } from "lucide-react";
import { getExpert } from "@/config/experts";
import { expertFolder } from "@/lib/drive-paths";
import { cn } from "@/lib/utils";
import { useAgentId } from "@/components/app/AppProvider";
import { ExpertAvatar } from "@/components/app/ExpertAvatar";
import { ChatProvider, useSessionUrl } from "@/components/chat/ChatProvider";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ChatView } from "@/components/chat/ChatView";
import { FilesView } from "@/components/files/FilesView";
import { ExpertFiche } from "./ExpertFiche";
import { ExpertEmails } from "./ExpertEmails";
import { ExpertRoutines } from "./ExpertRoutines";

export type ExpertTab = "discussion" | "livrables" | "routines" | "emails" | "fiche";

const TABS: { id: ExpertTab; label: string; icon: typeof MessageCircle; path: string }[] = [
  { id: "discussion", label: "Discussion", icon: MessageCircle, path: "" },
  { id: "livrables", label: "Livrables", icon: FolderOpen, path: "/livrables" },
  { id: "routines", label: "Routines", icon: Repeat, path: "/routines" },
  { id: "emails", label: "E-mails", icon: Mail, path: "/emails" },
  { id: "fiche", label: "Fiche de poste", icon: FileText, path: "/fiche" },
];

function ExpertColumn({ expertKey, tab }: { expertKey: string; tab: ExpertTab }) {
  const e = getExpert(expertKey)!;
  return (
    <aside className="sticky top-[62px] hidden h-[calc(100vh-62px)] flex-col gap-1 overflow-y-auto border-r border-line bg-surface px-3 py-3.5 lg:flex">
      <div className="relative isolate aspect-[1/1.02] shrink-0 overflow-hidden rounded-[22px] text-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/experts/${e.key}.jpg`} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover object-[50%_15%]" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-transparent from-45% to-[rgba(8,5,16,.82)]" />
        <div className="absolute inset-x-3 bottom-3">
          <p className="text-[17px] font-bold">{e.name}</p>
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] opacity-85">{e.role}</p>
        </div>
      </div>
      <p className="px-1.5 pb-1 pt-2 text-[13px] text-ink-3">{e.tagline}</p>
      <nav className="flex flex-col gap-0.5">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <Link
              key={t.id}
              href={`/experts/${e.key}${t.path}`}
              className={cn(
                "flex min-h-10 items-center gap-2.5 rounded-[11px] px-2.5 text-sm font-semibold",
                tab === t.id ? "bg-soft-2 text-ink" : "text-ink-2 hover:bg-soft"
              )}
            >
              <Icon className="h-[18px] w-[18px]" /> {t.label}
            </Link>
          );
        })}
      </nav>
      {tab === "discussion" && (
        <div className="mt-3 flex min-h-[200px] flex-1 flex-col border-t border-line pt-3">
          <ChatSidebar />
        </div>
      )}
    </aside>
  );
}

// Phones and tablets: the column folds into a header with tab pills.
function MobileHeader({ expertKey, tab }: { expertKey: string; tab: ExpertTab }) {
  const e = getExpert(expertKey)!;
  return (
    <div className="flex items-center gap-3 overflow-x-auto border-b border-line bg-surface px-4 py-2.5 lg:hidden">
      <ExpertAvatar expertKey={e.key} size={36} />
      <span className="mr-2 shrink-0 text-sm font-bold text-ink">{e.name}</span>
      {TABS.map((t) => (
        <Link
          key={t.id}
          href={`/experts/${e.key}${t.path}`}
          className={cn(
            "shrink-0 rounded-full px-3 py-1.5 text-[13px] font-semibold",
            tab === t.id ? "bg-tint text-brand" : "text-ink-2 hover:bg-soft"
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export function ExpertWorkspace({
  expertKey,
  tab,
  initialMessage,
}: {
  expertKey: string;
  tab: ExpertTab;
  initialMessage: string | null;
}) {
  const agentId = useAgentId();
  const [sessionId, navigate] = useSessionUrl();
  const e = getExpert(expertKey)!;

  const body = (
    <div className="lg:grid lg:grid-cols-[262px_minmax(0,1fr)]">
      <ExpertColumn expertKey={expertKey} tab={tab} />
      <div className="min-w-0">
        <MobileHeader expertKey={expertKey} tab={tab} />
        {tab === "discussion" ? (
          <div className="h-[calc(100vh-62px-57px)] lg:h-[calc(100vh-62px)]">
            <ChatView initialMessage={initialMessage} />
          </div>
        ) : tab === "livrables" ? (
          <div className="px-4 py-6 sm:px-8">
            <h1 className="font-display text-[26px] font-bold tracking-tight text-ink">Livrables de {e.name}</h1>
            <p className="mb-5 mt-1 text-sm text-ink-3">
              Ce qu’{e.pronoun === "elle" ? "elle" : "il"} a produit pour vous, rangé dans son dossier du drive de l’équipe.
            </p>
            <FilesView agentId={agentId} root={expertFolder(e.name)} rootLabel={`Livrables de ${e.name}`} />
          </div>
        ) : tab === "routines" ? (
          <div className="px-4 py-6 sm:px-8">
            <ExpertRoutines expertKey={expertKey} />
          </div>
        ) : tab === "emails" ? (
          <div className="px-4 py-6 sm:px-8">
            <ExpertEmails expertKey={expertKey} />
          </div>
        ) : (
          <div className="px-4 py-6 sm:px-8">
            <ExpertFiche expertKey={expertKey} />
          </div>
        )}
      </div>
    </div>
  );

  // The conversation list lives in the expert's column, so the chat state wraps the whole page.
  return tab === "discussion" ? (
    <ChatProvider agentId={agentId} profile={expertKey} urlSessionId={sessionId} navigateToSession={navigate}>
      {body}
    </ChatProvider>
  ) : (
    body
  );
}
