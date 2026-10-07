import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { pinnedWorkspaceId } from "@/lib/tenant";
import { AcceptInvite } from "@/components/AcceptInvite";
import { AuthShell, AuthHeading } from "@/components/auth/AuthShell";

type Ctx = { params: Promise<{ token: string }> };

export default async function InvitePage({ params }: Ctx) {
  const { token } = await params;
  const { user } = await getSession();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);

  // get_invitation is gated by the token (a secret), not by membership, so a not-yet-member can
  // read what they were invited to. Runs through the privileged client.
  const { data, error } = await createAdminClient().rpc("get_invitation", { p_token: token });
  const inv = (Array.isArray(data) ? data[0] : null) as
    | { workspace_id: string; workspace_name: string; role: string; expired: boolean }
    | null;

  // On a shared database, another client's invitation does not exist for this deployment.
  const pinned = await pinnedWorkspaceId();
  if (error || !inv || (pinned && inv.workspace_id !== pinned)) return <Message text="Cette invitation n’est pas valable, ou n’existe plus." />;
  if (inv.expired) return <Message text="Cette invitation a expiré." />;

  return <AcceptInvite token={token} workspaceName={inv.workspace_name} role={inv.role} />;
}

function Message({ text }: { text: string }) {
  return (
    <AuthShell>
      <AuthHeading title="Invitation indisponible">{text}</AuthHeading>
      <a
        href="/login"
        className="inline-flex h-[50px] items-center justify-center gap-2 rounded-[14px] bg-brand px-5 text-[15px] font-semibold text-white hover:opacity-90"
      >
        Retour à la connexion
      </a>
    </AuthShell>
  );
}
