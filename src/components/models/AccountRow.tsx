"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Key, Loader2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { ACCOUNT_STATE_LABELS, type LlmAccount } from "@/lib/llm-accounts";
import { cn } from "@/lib/utils";
import { LoginCode } from "./LoginCode";

const TONE: Record<LlmAccount["state"], string> = { active: "bg-ok-pale text-ok", pending: "bg-tint text-brand-ink", failed: "bg-ko-pale text-ko", refused: "bg-ko-pale text-ko" };

// Un compte dans son fournisseur : la poignée le déplace (souris, toucher ou clavier), le menu le
// renomme, change sa clé ou le retire. Une connexion en attente montre son code jusqu'à l'approbation.
export function AccountRow({ account, rank, kind, isLogin, onChanged }: { account: LlmAccount; rank: number; kind: string; isLogin: boolean; onChanged: () => Promise<void> }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `a:${account.id}` });
  const [editing, setEditing] = useState<"label" | "secret" | null>(null);
  const [removing, setRemoving] = useState(false);
  // Sans nom choisi : la nature et la fin de la clé, qui ne changent pas quand on déplace le compte.
  const name = account.label || [kind, account.name ?? account.hint].filter(Boolean).join(" ");

  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn("flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface px-2 py-2", isDragging && "relative z-10 shadow-lg")}>
      <button type="button" aria-label={`Déplacer ${name}`} className="grid h-7 w-6 cursor-grab max-sm:h-10 max-sm:w-9 touch-none place-items-center text-ink-3 hover:text-ink active:cursor-grabbing" {...attributes} {...listeners}>
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="w-5 text-center text-[11px] max-sm:text-[12px] font-semibold tabular-nums text-ink-3">{rank}</span>
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-ink">
          <span className="truncate">{name}</span>
        </p>
        <p className="truncate font-mono text-[11px] max-sm:text-[12px] text-ink-3">{account.name && account.baseUrl ? `${account.baseUrl}` : account.hint || (isLogin ? "Connexion par compte" : "")}</p>
      </div>
      <span className={cn("rounded-full px-2 py-0.5 text-[10px] max-sm:text-[12px] font-semibold", TONE[account.state])}>{ACCOUNT_STATE_LABELS[account.state]}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={`Options pour ${name}`} className="grid h-7 w-7 max-sm:size-10 place-items-center rounded-full text-ink-3 hover:bg-soft hover:text-ink">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => setEditing("label")} className="gap-2 text-xs"><Pencil className="h-3.5 w-3.5" />Renommer</DropdownMenuItem>
          {!isLogin && <DropdownMenuItem onClick={() => setEditing("secret")} className="gap-2 text-xs"><Key className="h-3.5 w-3.5" />Changer la clé</DropdownMenuItem>}
          <DropdownMenuItem onClick={() => setRemoving(true)} className="gap-2 text-xs text-ko focus:text-ko"><Trash2 className="h-3.5 w-3.5" />Retirer</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {account.state === "pending" && account.login && (
        <div className="w-full pl-11">
          <LoginCode account={account} onDone={onChanged} compact />
        </div>
      )}
      <EditDialog account={account} field={editing} onClose={() => setEditing(null)} onSaved={onChanged} />
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={`Retirer « ${name} » ?`}
        description="Ce compte sera retiré de cette instance. Les Experts passeront au compte suivant. La conversation en cours sera interrompue."
        confirmText="Retirer"
        destructive
        onConfirm={async () => {
          await apiFetch(`/api/llm/accounts/${account.id}`, { method: "DELETE" });
          await onChanged();
          toast.success("Compte retiré");
        }}
      />
    </li>
  );
}

function EditDialog({ account, field, onClose, onSaved }: { account: LlmAccount; field: "label" | "secret" | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (field === "secret" && !value.trim()) return setError("Collez la nouvelle clé.");
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/llm/accounts/${account.id}`, { method: "PATCH", body: JSON.stringify(field === "label" ? { label: value } : { secret: value }) });
      await onSaved();
      toast.success(field === "label" ? "Compte renommé" : "Clé remplacée");
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={field !== null} onOpenChange={(o) => { if (o) { setValue(field === "label" ? account.label : ""); setError(null); } else if (!busy) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={save} className="space-y-3">
          <DialogHeader>
            <DialogTitle className="text-base">{field === "label" ? "Renommer le compte" : "Changer la clé"}</DialogTitle>
          </DialogHeader>
          <Input autoFocus autoComplete="off" spellCheck={false} type={field === "secret" ? "password" : "text"} maxLength={field === "label" ? 60 : 4200} value={value} onChange={(e) => setValue(e.target.value)} placeholder={field === "label" ? "Compta, Abonnement de Selim…" : "Nouvelle clé"} className={field === "secret" ? "font-mono text-xs" : "text-sm"} />
          {error && <p role="alert" className="rounded-xl bg-ko-pale px-3 py-2 text-xs text-ko">{error}</p>}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Annuler</Button>
            <Button type="submit" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
