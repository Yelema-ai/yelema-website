"use client";

import { useAgentId } from "@/components/app/AppProvider";
import { FilesView } from "@/components/files/FilesView";

// Fichiers: the team's shared drive (~/Livrables on the workspace instance), where each expert
// saves its deliverables in its own folder and the team uploads its documents.
export default function FichiersPage() {
  const agentId = useAgentId();
  return (
    <div className="mx-auto flex h-[calc(100dvh-62px)] min-h-[520px] w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-8">
      <header className="shrink-0">
        <h1 className="font-display text-[26px] font-bold tracking-tight text-ink">Fichiers</h1>
        <p className="mt-1 text-sm text-ink-3">Le drive de votre équipe : vos documents et les livrables de vos experts.</p>
      </header>
      <div className="min-h-0 flex-1">
        <FilesView agentId={agentId} root="~/Livrables" rootLabel="Fichiers" />
      </div>
    </div>
  );
}
