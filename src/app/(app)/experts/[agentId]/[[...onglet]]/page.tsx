import { notFound } from "next/navigation";
import { agentAccessRole, getAgentRow, requireUser } from "@/lib/auth";
import { parseAgentRoute } from "@/lib/expert-tabs";
import { AgentWorkspace } from "@/components/AgentWorkspace";

// L'espace d'un expert. L'instance et l'expert (son profil Hermes) sont portés par l'URL, puis
// l'onglet : /experts/{agentId}/{profileId}/{onglet}, « chat » par défaut. Sans profil, c'est le
// profil par défaut de l'instance. La route vit dans le groupe
// (app), donc dans le chrome commun : plus d'écran de choix d'instance, la liste des experts
// est en permanence dans la barre latérale.
export default async function AgentWorkspacePage({
  params,
}: {
  params: Promise<{ agentId: string; onglet?: string[] }>;
}) {
  const { agentId, onglet } = await params;

  // One grammar, shared with the client SPA: an unknown tab or extra segments 404 here.
  const route = parseAgentRoute(onglet);
  if (route === null) notFound();

  const { db, user } = await requireUser();

  // The Supabase mirror is the source of truth for which app-workspace owns an agent. A missing
  // row, or a viewer who is neither its owner nor an admin of its workspace, is a 404 (we don't
  // leak existence).
  const row = await getAgentRow(db, agentId).catch(() => null);
  if (!row) notFound();
  const role = await agentAccessRole(db, row, user.id);
  if (!role) notFound();

  return (
    <AgentWorkspace
      // A different expert is a different chat: remount so no thread or draft carries over.
      key={`${agentId}:${route.profileId ?? ""}`}
      agentId={agentId}
      profileId={route.profileId}
      workspaceId={row.workspace_id}
      role={role}
      isOwner={row.owner_user_id === user.id}
      initialTab={route.tab}
    />
  );
}
