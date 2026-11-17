"use client";

import { useCallback, useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import { domainRefusal, inviteBlocked, quotaLabel } from "@/lib/member-room";
import type { MemberRoom, Role, WorkspaceMember } from "@/lib/types";

// An admin invites and removes the members of the enterprise chat; members with Experts are added and
// removed by Yelema and are shown read-only.

function roleLabel(role: Role) {
  return role === "admin" ? "Admin" : "Membre";
}

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("fr-FR") : "—";
}

// The back office's word for a member's state, in French; one it adds later reads « Inconnu »
// rather than as a raw key.
const STATUS: Record<string, string> = {
  active: "Actif",
  suspended: "Suspendu",
  pending: "En attente",
  provisioning: "En installation",
  failed: "Installation en échec",
  to_remove: "En cours de retrait",
};

export type LoadedMembers = { members: WorkspaceMember[] } & Partial<MemberRoom>;
type Loaded = LoadedMembers;

/** `initial`: the list the page read on the server, shown at once and read again behind. */
export function MembersView({ initial = null }: { initial?: Loaded | null }) {
  const { current } = useWorkspace();
  const [data, setData] = useState<Loaded>(initial ?? { members: [] });
  const [loading, setLoading] = useState(!initial);
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<WorkspaceMember | null>(null);

  const load = useCallback(async () => {
    if (!current) return;
    try {
      setData(await apiFetch<Loaded>(`/api/workspaces/${current.id}/members`));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [current]);

  useEffect(() => {
    if (!initial) setLoading(true);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  if (!current) return <p className="text-sm text-muted-foreground">Aucun espace sélectionné.</p>;
  const { members } = data;
  const room: MemberRoom | null = data.quota ? { quota: data.quota, seats: data.seats ?? null, enterpriseOpen: data.enterpriseOpen ?? false } : null;
  const blocked = room ? inviteBlocked(room) : null;
  // State, access and instance columns appear when the source gives them (the back office's list).
  const detailed = members.some((m) => m.status != null || m.instance_name != null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="sr-only">Membres</h1>
          <p className="text-sm text-muted-foreground">
            {room ? "Vous invitez les membres du chat d’entreprise. Ceux qui ont des Experts sont ajoutés par l’équipe Yelema." : `Les membres de ${current.name} sont ajoutés et retirés par l’équipe Yelema.`}
          </p>
          {room && (
            <p className="mt-1 text-sm">
              <span className="font-medium">{quotaLabel(room.quota)}</span>
              {room.seats && <span className="text-muted-foreground"> Chat d’entreprise : {room.seats.used} membres sur {room.seats.cap}.</span>}
            </p>
          )}
        </div>
        {room && (
          <div className="flex flex-col items-end gap-1">
            <Button onClick={() => setInviting(true)} disabled={blocked != null}>
              <UserPlus className="mr-1.5 h-4 w-4" /> Inviter au chat d’entreprise
            </Button>
            {blocked && <p className="max-w-xs text-right text-xs text-muted-foreground">{blocked}</p>}
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Membre</th>
                <th className="px-4 py-2.5 font-medium">Rôle</th>
                {detailed && <th className="px-4 py-2.5 font-medium">Accès</th>}
                {detailed && <th className="px-4 py-2.5 font-medium">État</th>}
                {detailed && <th className="px-4 py-2.5 font-medium">Espace</th>}
                <th className="px-4 py-2.5 font-medium">Ajouté le</th>
                {room && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id ?? m.user_id} className="border-t">
                  <td className="px-4 py-3">
                    <span className="block font-medium">{m.name?.trim() || m.email}</span>
                    {m.name?.trim() && <span className="block text-xs text-muted-foreground">{m.email}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={m.role === "admin" ? "default" : "outline"}>{roleLabel(m.role)}</Badge>
                  </td>
                  {detailed && <td className="px-4 py-3">{m.access === "entreprise" ? "Chat d’entreprise" : "Ses Experts"}</td>}
                  {detailed && <td className="px-4 py-3">{m.status ? (STATUS[m.status] ?? "Inconnu") : "—"}</td>}
                  {detailed && <td className="px-4 py-3">{m.instance_name ?? "—"}</td>}
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(m.created_at)}</td>
                  {room && (
                    <td className="px-4 py-3 text-right">
                      {m.removable && (
                        // Une invitation pas encore acceptée s'annule (mauvaise adresse) ; un membre se retire.
                        <Button variant="ghost" size="sm" onClick={() => setRemoving(m)}>
                          {m.status === "pending" ? "Annuler l’invitation" : "Retirer"}
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <InviteDialog workspaceId={current.id} domains={data.allowedDomains ?? []} open={inviting} onOpenChange={setInviting} onDone={load} />
      <ConfirmDialog
        open={removing != null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={removing?.status === "pending" ? `Annuler l’invitation de ${removing?.name?.trim() || removing?.email || ""} ?` : `Retirer ${removing?.name?.trim() || removing?.email || ""} du chat d’entreprise ?`}
        description={removing?.status === "pending" ? `Le lien envoyé à ${removing.email} ne marchera plus. Vous pourrez inviter la bonne adresse ensuite.` : "Son accès est coupé et ses conversations sont archivées, puis effacées après 30 jours. Sa place sur votre abonnement est libérée."}
        confirmText={removing?.status === "pending" ? "Annuler l’invitation" : "Retirer"}
        destructive
        onConfirm={async () => {
          if (!removing?.id) return;
          await apiFetch(`/api/workspaces/${current.id}/members/${removing.id}`, { method: "DELETE" });
          toast.success(removing.status === "pending" ? "Invitation annulée." : "Membre retiré.");
          await load();
        }}
      />
    </div>
  );
}

function InviteDialog({ workspaceId, domains, open, onOpenChange, onDone }: { workspaceId: string; domains: string[]; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => Promise<void> }) {
  const [form, setForm] = useState({ email: "", firstName: "", lastName: "" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  // Seulement les domaines de l'entreprise : dit dès que l'adresse est complète, avant l'envoi.
  const refused = /@[^@\s]+\.[^@\s]+$/.test(form.email.trim()) ? domainRefusal(form.email, domains) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (domainRefusal(form.email, domains)) return;
    setBusy(true);
    try {
      const r = await apiFetch<{ ok: true; warning: string | null }>(`/api/workspaces/${workspaceId}/members`, { method: "POST", body: JSON.stringify(form) });
      toast.success(`Invitation envoyée à ${form.firstName} : son accès arrive par e-mail.`);
      if (r.warning) toast.warning(r.warning);
      setForm({ email: "", firstName: "", lastName: "" });
      onOpenChange(false);
      await onDone();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Inviter au chat d’entreprise</DialogTitle>
            <DialogDescription>La personne reçoit son accès par e-mail et arrive directement dans le chat d’entreprise.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="inv-first">Prénom</Label>
              <Input id="inv-first" value={form.firstName} onChange={set("firstName")} required maxLength={60} autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-last">Nom</Label>
              <Input id="inv-last" value={form.lastName} onChange={set("lastName")} required maxLength={60} autoComplete="off" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-email">E-mail professionnel</Label>
            <Input id="inv-email" type="email" value={form.email} onChange={set("email")} required maxLength={254} autoComplete="off" placeholder={domains[0] ? `prenom@${domains[0]}` : undefined} aria-invalid={Boolean(refused)} aria-describedby={refused ? "inv-email-refus" : undefined} />
            {refused && <p id="inv-email-refus" role="alert" className="text-xs text-ko">{refused}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Annuler
            </Button>
            <Button type="submit" disabled={busy || Boolean(refused)}>
              {busy ? "Invitation…" : "Inviter"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
