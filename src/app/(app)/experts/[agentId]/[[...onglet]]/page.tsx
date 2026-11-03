import { notFound, redirect } from "next/navigation";
import { agentAccessRole, backofficeAgentRow, getAgentRow, getRole, requireUser } from "@/lib/auth";
import { authViaBackoffice } from "@/lib/runtime-config";
import { openConversation } from "@/lib/conversation-token";
import { movedTabPath, parseAgentRoute, resolveProfile } from "@/lib/expert-tabs";
import { AgentWorkspace } from "@/components/AgentWorkspace";

// L'espace d'un expert. L'instance et l'expert (son profil Hermes) sont portés par l'URL, puis
// l'onglet : /experts/{agentId}/{profileId}/{onglet}, « chat » par défaut. Sans profil, c'est le
// profil par défaut de l'instance. La route vit dans le groupe
// (app), donc dans le chrome commun : plus d'écran de choix d'instance, la liste des experts
// est en permanence dans la barre latérale.
export default async function AgentWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ agentId: string; onglet?: string[] }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const { agentId, onglet } = await params;

  const moved = movedTabPath(onglet);
  if (moved) redirect(moved);

  // One grammar, shared with the client SPA: an unknown tab or extra segments 404 here.
  const route = parseAgentRoute(onglet);
  if (route === null) notFound();

  // Through the back office the page is its member's own instance or nothing: its answer for the
  // caller's instance says so, without another round of "who is this".
  if (authViaBackoffice()) {
    const row = await backofficeAgentRow();
    if (!row || row.agent37_id !== agentId) notFound();
    const profileId = route.profileId && (resolveProfile(route.profileId, row.profiles ?? []) ?? route.profileId);
    return <AgentWorkspace key={`${agentId}:${profileId ?? ""}`} agentId={agentId} profileId={profileId} workspaceId={row.workspace_id} initialTab={route.tab} />;
  }

  const { db, user } = await requireUser();

  // The Supabase mirror is the source of truth for which app-workspace owns an agent. A missing
  // row, or a viewer who is not its owner (workspace admins included), is a 404 (we don't
  // leak existence).
  const row = await getAgentRow(db, agentId).catch(() => null);
  if (!row) notFound();
  const role = await agentAccessRole(db, row, user.id);
  if (!role) {
    // A colleague opening a link copied by the owner (« Copier le lien »): the token names this
    // instance and the owner's workspace; a member of that workspace reads it, read-only.
    const { c } = await searchParams;
    const claims = openConversation(c);
    if (claims && claims.a === agentId && claims.w === row.workspace_id && (await getRole(db, claims.w, user.id))) {
      redirect(`/conversations/partagee?c=${c}`);
    }
    notFound();
  }

  return (
    <AgentWorkspace
      // A different expert is a different chat: remount so no thread or draft carries over.
      key={`${agentId}:${route.profileId ?? ""}`}
      agentId={agentId}
      profileId={route.profileId}
      workspaceId={row.workspace_id}
      initialTab={route.tab}
    />
  );
}
