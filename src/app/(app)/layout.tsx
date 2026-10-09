import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceAgent, loadWorkspaces, pickWorkspace } from "@/lib/workspace";
import { AppProvider } from "@/components/app/AppProvider";
import { AppShell } from "@/components/app/AppShell";
import { ComputerProvider } from "@/components/experts/ComputerProvider";
import { InstallingScreen, NoWorkspaceScreen } from "@/components/app/InstallingScreen";

// The signed-in user's workspaces and the one they're looking at, read once per request (the
// metadata and the layout both need them).
const currentWorkspace = cache(async (userId: string) => {
  const workspaces = await loadWorkspaces(createAdminClient(), userId);
  return { workspaces, workspace: await pickWorkspace(workspaces) };
});

// The client's logo (set by the back office) is the browser tab icon; Yelema's when it has none.
export async function generateMetadata(): Promise<Metadata> {
  const { user } = await getSession();
  if (!user) return {};
  const { workspace } = await currentWorkspace(user.id);
  return workspace?.logo_url ? { icons: { icon: workspace.logo_url } } : {};
}

// Every signed-in page: resolves the user's workspace and its instance once, server-side. Until the
// back office has finished installing the experts, every page shows the "équipe s'installe" screen.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getSession();
  if (!user) redirect("/login");

  const { workspaces, workspace } = await currentWorkspace(user.id);
  if (!workspace) return <NoWorkspaceScreen email={user.email ?? ""} />;
  const agent = await getWorkspaceAgent(createAdminClient(), workspace.id);

  const name = (user.user_metadata?.name as string | undefined)?.trim() || "";
  return (
    <AppProvider
      value={{
        user: { id: user.id, email: user.email ?? "", name },
        workspace: { id: workspace.id, name: workspace.name, logoUrl: workspace.logo_url },
        workspaces: workspaces.map((w) => ({ id: w.id, name: w.name })),
        agentId: agent?.ready ? agent.agent37_id : null,
        profiles: (agent?.profiles as string[] | undefined) ?? [],
      }}
    >
      <AppShell>
        {agent?.ready ? (
          <ComputerProvider key={agent.agent37_id} agentId={agent.agent37_id}>
            {children}
          </ComputerProvider>
        ) : (
          <InstallingScreen />
        )}
      </AppShell>
    </AppProvider>
  );
}
