"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Copy, Link2, Loader2, Mail, MoreHorizontal, UserMinus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import type { WorkspaceMember } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useApp } from "@/components/app/AppProvider";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Team {
  members: WorkspaceMember[];
  owner_id: string | null;
  email_enabled: boolean;
}

interface AccessLink {
  member: WorkspaceMember;
  link: string;
  emailed: boolean;
}

// Membre | Rôle | Ajouté le | Dernière connexion | menu, from md up. Below, a row stacks.
const COLUMNS = "md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.1fr)_36px]";

function displayName(m: WorkspaceMember): string {
  return m.name || m.email;
}

function frDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

// The access link, read-only, with a copy button. Shown after adding someone and from a row's menu.
function AccessLinkField({ link }: { link: string }) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Lien copié");
    } catch {
      inputRef.current?.select();
      toast.error("Copie impossible : sélectionnez le lien et copiez-le.");
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Lien d’accès</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id={id}
          ref={inputRef}
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="text-[13px]"
        />
        <Button type="button" onClick={copy} className="h-11 shrink-0">
          <Copy /> Copier le lien
        </Button>
      </div>
      <p className="text-xs text-ink-3">Valable 7 jours, une seule utilisation.</p>
    </div>
  );
}

// "Ajouter un admin": an email, then the result (joined, emailed or not) with the link to copy.
function AddAdminDialog({
  open,
  onOpenChange,
  workspaceId,
  emailEnabled,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  emailEnabled: boolean;
  onAdded: () => void;
}) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ email: string; link: string; emailed: boolean } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ link: string; emailed: boolean }>(`/api/workspaces/${workspaceId}/members`, {
        method: "POST",
        body: JSON.stringify({ email: email.trim() }),
      });
      setResult({ email: email.trim().toLowerCase(), link: res.link, emailed: res.emailed });
      onAdded();
    } catch {
      setError("Impossible d’ajouter cette personne. Vérifiez l’adresse e-mail et réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle>Admin ajouté</DialogTitle>
              <DialogDescription>{result.email} fait maintenant partie de l’équipe.</DialogDescription>
            </DialogHeader>
            <p
              className={cn(
                "rounded-xl px-3 py-2 text-[13px]",
                result.emailed ? "bg-ok-pale text-ok" : "bg-soft text-ink-2"
              )}
            >
              {result.emailed
                ? "Un e-mail lui a été envoyé. Vous pouvez aussi lui transmettre ce lien."
                : emailEnabled
                  ? "L’e-mail n’a pas pu être envoyé : copiez ce lien et envoyez-le-lui."
                  : "L’envoi d’e-mails n’est pas activé : copiez ce lien et envoyez-le-lui."}
            </p>
            <AccessLinkField link={result.link} />
            <DialogFooter>
              <Button type="button" onClick={() => onOpenChange(false)}>
                Terminé
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Ajouter un admin</DialogTitle>
              <DialogDescription>
                La personne devient admin tout de suite et reçoit un lien pour choisir son mot de passe.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor={id}>Adresse e-mail</Label>
              <Input
                id={id}
                type="email"
                required
                autoFocus
                autoComplete="off"
                placeholder="prenom.nom@entreprise.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {error && <p className="text-[13px] text-ko">{error}</p>}
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                Annuler
              </Button>
              <Button type="submit" disabled={busy || !email.trim()}>
                {busy ? <Loader2 className="animate-spin" /> : <UserPlus />}
                {busy ? "Ajout…" : "Ajouter"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// A fresh access link for one member (first sign-in or forgotten password), optionally emailed.
function AccessLinkDialog({
  access,
  onClose,
  onChange,
  workspaceId,
  emailEnabled,
}: {
  access: AccessLink | null;
  onClose: () => void;
  onChange: (access: AccessLink) => void;
  workspaceId: string;
  emailEnabled: boolean;
}) {
  const [sending, setSending] = useState(false);

  async function sendByEmail() {
    if (!access) return;
    setSending(true);
    try {
      const res = await apiFetch<{ link: string; emailed: boolean }>(
        `/api/workspaces/${workspaceId}/members/${access.member.user_id}/link`,
        { method: "POST", body: JSON.stringify({ send: true }) }
      );
      onChange({ member: access.member, link: res.link, emailed: res.emailed });
      if (res.emailed) toast.success("E-mail envoyé");
      else toast.error("L’e-mail n’a pas pu être envoyé : copiez le lien à la place.");
    } catch {
      toast.error("L’e-mail n’a pas pu être envoyé : copiez le lien à la place.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={access !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {access && (
          <>
            <DialogHeader>
              <DialogTitle>Lien d’accès</DialogTitle>
              <DialogDescription>
                Pour {displayName(access.member)} : première connexion ou mot de passe oublié.
              </DialogDescription>
            </DialogHeader>
            {access.emailed ? (
              <p className="rounded-xl bg-ok-pale px-3 py-2 text-[13px] text-ok">
                Un e-mail avec ce lien a été envoyé à {access.member.email}.
              </p>
            ) : (
              !emailEnabled && (
                <p className="rounded-xl bg-soft px-3 py-2 text-[13px] text-ink-2">
                  L’envoi d’e-mails n’est pas activé : copiez ce lien et envoyez-le-lui.
                </p>
              )
            )}
            <AccessLinkField link={access.link} />
            <DialogFooter className="gap-2 sm:gap-0">
              {emailEnabled && !access.emailed && (
                <Button type="button" variant="outline" onClick={sendByEmail} disabled={sending}>
                  {sending ? <Loader2 className="animate-spin" /> : <Mail />}
                  Envoyer par e-mail
                </Button>
              )}
              <Button type="button" onClick={onClose}>
                Terminé
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold", className)}>
      {children}
    </span>
  );
}

// Paramètres > Équipe: everyone in the workspace (all admins), adding one, access links, removing.
export function TeamView() {
  const { user, workspace } = useApp();
  const searchParams = useSearchParams();
  const [team, setTeam] = useState<Team | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addKey, setAddKey] = useState(0);
  const [linkBusyId, setLinkBusyId] = useState<string | null>(null);
  const [access, setAccess] = useState<AccessLink | null>(null);
  const [removing, setRemoving] = useState<WorkspaceMember | null>(null);

  const load = useCallback(async () => {
    setTeam(await apiFetch<Team>(`/api/workspaces/${workspace.id}/members`));
  }, [workspace.id]);

  const firstLoad = useCallback(() => {
    setLoadError(false);
    load().catch(() => setLoadError(true));
  }, [load]);

  useEffect(firstLoad, [firstLoad]);

  // A fresh dialog each time (the key resets its form).
  const openAdd = useCallback(() => {
    setAddKey((k) => k + 1);
    setAddOpen(true);
  }, []);

  // `?ajouter=1` opens the add dialog, then leaves the URL so a refresh doesn't reopen it.
  const wantsAdd = searchParams.get("ajouter") === "1";
  useEffect(() => {
    if (!wantsAdd) return;
    openAdd();
    const url = new URL(window.location.href);
    url.searchParams.delete("ajouter");
    window.history.replaceState(window.history.state, "", url);
  }, [wantsAdd, openAdd]);

  const refreshAfterAdd = useCallback(() => {
    load().catch(() => toast.error("Impossible d’actualiser la liste de l’équipe."));
  }, [load]);

  async function getLink(member: WorkspaceMember) {
    setLinkBusyId(member.user_id);
    try {
      const res = await apiFetch<{ link: string; emailed: boolean }>(
        `/api/workspaces/${workspace.id}/members/${member.user_id}/link`,
        { method: "POST", body: JSON.stringify({}) }
      );
      setAccess({ member, link: res.link, emailed: res.emailed });
    } catch {
      toast.error("Impossible de créer le lien d’accès. Réessayez.");
    } finally {
      setLinkBusyId(null);
    }
  }

  async function remove() {
    if (!removing) return;
    const member = removing;
    try {
      await apiFetch(`/api/workspaces/${workspace.id}/members/${member.user_id}`, { method: "DELETE" });
    } catch {
      throw new Error("Impossible de retirer ce membre. Réessayez.");
    }
    setTeam((t) => t && { ...t, members: t.members.filter((m) => m.user_id !== member.user_id) });
    toast.success(`${displayName(member)} ne fait plus partie de l’équipe.`);
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-display text-[24px] font-bold tracking-tight text-ink">Équipe</h2>
          <p className="mt-1 max-w-xl text-sm text-ink-3">
            Tous les membres sont admins : ils voient les mêmes experts, conversations et fichiers.
          </p>
        </div>
        <Button onClick={openAdd} className="self-start sm:self-auto">
          <UserPlus /> Ajouter un admin
        </Button>
      </div>

      <div className="mt-6 overflow-hidden rounded-[22px] border border-line bg-surface">
        {!team ? (
          loadError ? (
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <p className="text-sm text-ink-2">Impossible de charger l’équipe.</p>
              <Button variant="outline" size="sm" onClick={firstLoad}>
                Réessayer
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-ink-3">
              <Loader2 className="h-4 w-4 animate-spin" /> Chargement de l’équipe…
            </div>
          )
        ) : (
          <>
            <div
              className={cn(
                "hidden gap-4 border-b border-line px-5 py-3 text-xs font-semibold text-ink-3 md:grid",
                COLUMNS
              )}
            >
              <span>Membre</span>
              <span>Rôle</span>
              <span>Ajouté le</span>
              <span>Dernière connexion</span>
              <span className="sr-only">Actions</span>
            </div>
            <ul className="divide-y divide-line">
              {team.members.map((m) => {
                const label = displayName(m);
                const isMe = m.user_id === user.id;
                const isOwner = m.user_id === team.owner_id;
                return (
                  <li
                    key={m.user_id}
                    className={cn(
                      "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5",
                      COLUMNS
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-soft-2 text-[13px] font-bold text-brand">
                        {(label.trim()[0] ?? "?").toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">
                          {label}
                          {isMe && <span className="font-medium text-ink-3"> (vous)</span>}
                        </p>
                        {m.name && <p className="truncate text-xs text-ink-3">{m.email}</p>}
                      </div>
                    </div>

                    {/* Mobile: one wrapped line under the name. From md up, these are the middle columns. */}
                    <div className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-12 md:contents">
                      <div className="flex flex-wrap gap-1.5">
                        <Pill className="bg-tint text-brand">Admin</Pill>
                        {isOwner && <Pill className="bg-coral-pale text-coral-ink">Compte principal</Pill>}
                      </div>
                      <p className="text-[13px] text-ink-2">
                        <span className="md:hidden">Ajouté le </span>
                        {frDate(m.created_at)}
                      </p>
                      <p className="text-[13px] text-ink-2">
                        {m.last_sign_in_at ? (
                          <>
                            <span className="md:hidden">Dernière connexion le </span>
                            {frDate(m.last_sign_in_at)}
                          </>
                        ) : (
                          <span className="text-ink-3">Jamais connecté</span>
                        )}
                      </p>
                    </div>

                    <div className="col-start-2 row-start-1 justify-self-end md:col-start-5">
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9"
                            aria-label={`Actions pour ${label}`}
                            disabled={linkBusyId === m.user_id}
                          >
                            {linkBusyId === m.user_id ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuItem onSelect={() => void getLink(m)}>
                            <Link2 /> Copier un lien d’accès
                          </DropdownMenuItem>
                          {!isMe && !isOwner && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(m)}>
                                <UserMinus /> Retirer de l’équipe
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      <AddAdminDialog
        key={addKey}
        open={addOpen}
        onOpenChange={setAddOpen}
        workspaceId={workspace.id}
        emailEnabled={team?.email_enabled ?? false}
        onAdded={refreshAfterAdd}
      />

      <AccessLinkDialog
        access={access}
        onClose={() => setAccess(null)}
        onChange={setAccess}
        workspaceId={workspace.id}
        emailEnabled={team?.email_enabled ?? false}
      />

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={removing ? `Retirer ${displayName(removing)} de l’équipe ?` : ""}
        description={`Cette personne n’aura plus accès à l’espace ${workspace.name}. Ses liens d’accès en attente ne fonctionneront plus.`}
        confirmText="Retirer"
        destructive
        onConfirm={remove}
      />
    </div>
  );
}
