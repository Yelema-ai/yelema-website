import { redirect } from "next/navigation";
import { appContext } from "@/lib/app-context";
import { WorkspaceProvider } from "@/components/WorkspaceProvider";
import { UnlinkedAccount } from "@/components/UnlinkedAccount";
import { AppShell } from "@/components/app/AppShell";
import { tabBootstrap } from "@/lib/bootstrap-server";
import type { Bootstrap } from "@/lib/bootstrap-client";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, me, workspaces, initial } = await appContext();
  if (!user) redirect("/login");
  // One client per deployment: the back-office creates THE workspace and its admin, and everyone
  // else joins by invitation. A signed-in account with no membership is simply not attached yet.
  if (!initial) return <UnlinkedAccount email={user.email ?? ""} />;

  // Un seul chrome pour tout le groupe (app), espace expert compris : c'est ce qui remplace
  // l'écran de choix d'instance. Le <main> ne pose aucune marge — chaque page choisit son mode
  // en enveloppant ou non son contenu dans <Page>.
  return (
    <WorkspaceProvider initialWorkspaces={workspaces} userEmail={user.email ?? ""} userName={user.name} userFirstName={user.firstName} userAvatarUrl={me?.user.avatarUrl ?? null}>
      {/* The tab's first read starts here, not after the JS loaded: not awaited, it streams in behind the page. */}
      <AppShell initialExperts={initial.experts} initialAgents={initial.agents} initialCatalogue={initial.catalogue} bootstrap={tabBootstrap().catch(() => null) as Promise<Bootstrap | null>}>
        {children}
      </AppShell>
    </WorkspaceProvider>
  );
}
