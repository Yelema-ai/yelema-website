import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceAgent, loadWorkspaces, pickWorkspace } from "@/lib/workspace";
import { AppProvider } from "@/components/app/AppProvider";
import { AppShell } from "@/components/app/AppShell";
import { InstallingScreen, NoWorkspaceScreen } from "@/components/app/InstallingScreen";

// Every signed-in page: resolves the user's workspace and its instance once, server-side. Until the
// back office has finished installing the experts, every page shows the "équipe s'installe" screen.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getSession();
  if (!user) redirect("/login");

  const db = createAdminClient();
  const workspaces = await loadWorkspaces(db, user.id);
  const workspace = await pickWorkspace(workspaces);
  if (!workspace) return <NoWorkspaceScreen email={user.email ?? ""} />;
  const agent = await getWorkspaceAgent(db, workspace.id);

  const name = (user.user_metadata?.name as string | undefined)?.trim() || "";
  return (
    <AppProvider
      value={{
        user: { id: user.id, email: user.email ?? "", name },
        workspace: { id: workspace.id, name: workspace.name, logoUrl: workspace.logo_url },
        workspaces: workspaces.map((w) => ({ id: w.id, name: w.name })),
        agentId: agent?.ready ? agent.agent37_id : null,
      }}
    >
      <AppShell>{agent?.ready ? children : <InstallingScreen />}</AppShell>
    </AppProvider>
  );
}
