import { redirect } from "next/navigation";
import { getExpert } from "@/config/experts";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceAgent, loadWorkspaces, pickWorkspace } from "@/lib/workspace";
import { ExpertWorkspace, type ExpertTab } from "@/components/experts/ExpertWorkspace";

const TABS: Record<string, ExpertTab> = {
  livrables: "livrables",
  routines: "routines",
  emails: "emails",
  fiche: "fiche",
};

// An expert's space: /experts/<key> (Discussion), /experts/<key>/livrables, /experts/<key>/routines,
// /experts/<key>/fiche.
export default async function ExpertPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string; tab?: string[] }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { key, tab } = await params;
  const { q } = await searchParams;
  const expert = getExpert(key);
  if (!expert) redirect("/accueil");

  // Validate that the requested expert profile is deployed on this workspace
  const { user } = await getSession();
  if (!user) redirect("/login");

  const workspaces = await loadWorkspaces(createAdminClient(), user.id);
  const workspace = await pickWorkspace(workspaces);
  if (workspace) {
    const agent = await getWorkspaceAgent(createAdminClient(), workspace.id);
    const profiles = (agent?.profiles as string[] | undefined) ?? [];
    if (profiles.length > 0 && !profiles.includes(expert.key)) {
      redirect("/accueil");
    }
  }

  const activeTabSegment = tab && tab.length > 0 ? tab[0] : null;
  if (tab && tab.length > 1) redirect(`/experts/${expert.key}`);
  if (activeTabSegment && !TABS[activeTabSegment]) redirect(`/experts/${expert.key}`);

  const activeTab = activeTabSegment ? TABS[activeTabSegment] : "discussion";
  return <ExpertWorkspace expertKey={expert.key} tab={activeTab} initialMessage={q ?? null} />;
}
