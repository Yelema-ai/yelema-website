"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, readApiError } from "@/lib/api";
import type { MemoryItem, MemoryList, MemoryStatus } from "@/lib/memory";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { HiddenFileInput } from "@/components/HiddenFileInput";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// The company memory: what the experts know of the company. Everyone sees the deposits of their own
// compartments; whoever may deposit adds a note or a document. The back office sends each deposit
// to the memory in the background and applies the org chart on every question an expert asks.

const STATUS: Record<MemoryStatus, { label: string; variant: "success" | "warning" | "muted" | "destructive" }> = {
  pending: { label: "Envoi en cours", variant: "warning" },
  synced: { label: "Lisible par les experts", variant: "success" },
  skipped: { label: "Non envoyé", variant: "muted" },
  error: { label: "Envoi impossible", variant: "destructive" },
};
const ALL = "";
const FIELD = "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm font-normal text-ink focus-visible:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/15";
const SELECT = "w-full flex h-11 max-w-full rounded-xl border border-line bg-surface px-3 text-[15px] font-normal text-ink focus-visible:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/15";

// `embedded`: shown under the company's logo and presentation, on the Entreprise tab.
export function MemoryView({ embedded = false, onDeposit }: { embedded?: boolean; onDeposit?: () => void }) {
  const [list, setList] = useState<MemoryList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<MemoryItem | null>(null);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [unit, setUnit] = useState(ALL);
  const [files, setFiles] = useState<File[]>([]);
  const picker = useRef<HTMLInputElement>(null);

  const load = useCallback(
    () =>
      apiFetch<MemoryList>("/api/memory/items")
        .then(setList)
        .catch((e: Error) => setError(e.message)),
    []
  );
  useEffect(() => void load(), [load]);

  // A deposit is sent in the background: read again while one is still on its way.
  const waiting = list?.items.some((i) => i.status === "pending") ?? false;
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => void load(), 5_000);
    return () => clearTimeout(timer);
  }, [waiting, list, load]);

  const targets = [...(list?.canDepositForAll ? [{ id: ALL, name: "Toute l’entreprise" }] : []), ...(list?.units.filter((u) => u.canDeposit) ?? [])];
  const unitName = (id: string | null) => (id === null ? "Toute l’entreprise" : (list?.units.find((u) => u.id === id)?.name ?? "Unité"));
  // The first compartment the member may deposit in, while none is chosen.
  const target = targets.some((t) => t.id === unit) ? unit : (targets[0]?.id ?? ALL);

  // The note, then each document on its own: a document takes the title only when it is alone.
  async function deposit() {
    setBusy(true);
    const failed: File[] = [];
    try {
      if (note.trim()) {
        await apiFetch("/api/memory/items", { method: "POST", body: JSON.stringify({ title, note, unit: target === ALL ? null : target }) });
        setTitle("");
        setNote("");
      }
      for (const file of files) {
        const form = new FormData();
        form.set("title", (files.length === 1 && !note.trim() && title.trim()) || file.name);
        if (target !== ALL) form.set("unit", target);
        form.set("file", file);
        const res = await fetch("/api/memory/items", { method: "POST", body: form });
        if (!res.ok) {
          failed.push(file);
          toast.error(`${file.name} : ${await readApiError(res, "le document n’a pas pu être déposé.")}`);
        }
      }
      if (files.length > 0 && failed.length < files.length) setTitle("");
      setFiles(failed);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      await load();
      onDeposit?.();
    }
  }

  async function patch(item: MemoryItem, body: { active: boolean }) {
    try {
      await apiFetch(`/api/memory/items/${item.id}`, { method: "PATCH", body: JSON.stringify(body) });
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="max-w-4xl">
      {embedded ? (
        <h2 className="mt-10 font-display text-[22px] font-bold tracking-tight text-ink">Mémoire de l’entreprise</h2>
      ) : (
        <h1 className="font-display text-[28px] font-bold tracking-tight text-ink">Mémoire de l’entreprise</h1>
      )}
      <p className="mt-1 max-w-2xl text-sm text-ink-2">
        Ce que vos experts savent de l’entreprise : règles, procédures, documents de référence. Chaque expert ne lit que les compartiments ouverts à son utilisateur par l’organigramme.
      </p>

      {error && <p className="mt-4 max-w-xl rounded-xl bg-ko-pale px-4 py-3 text-sm text-ko">{error}</p>}
      {!list && !error && <Loader2 className="mt-6 h-5 w-5 animate-spin text-ink-3" aria-label="Chargement" />}

      {list && targets.length > 0 && (
        <section className="mt-5 rounded-[22px] border border-line bg-surface p-5 sm:p-6" aria-busy={busy}>
          <h2 className="text-lg font-bold text-ink">Déposer</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-[13px] font-semibold text-ink-3">
              Titre
              <Input className="mt-1" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="text-[13px] font-semibold text-ink-3">
              Lisible par
              <select className={`mt-1 ${SELECT}`} value={target} onChange={(e) => setUnit(e.target.value)}>
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="mt-3 block text-[13px] font-semibold text-ink-3">
            Texte de la note
            <textarea className={`mt-1 min-h-28 ${FIELD}`} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="mt-3">
            <p className="text-[13px] font-semibold text-ink-3">Documents de référence (PDF, texte ou JSON, 5 Mo au plus chacun)</p>
            {files.length > 0 && (
              <ul className="mt-1 space-y-1">
                {files.map((f, i) => (
                  <li key={`${f.name}:${i}`} className="flex min-w-0 items-center gap-2 text-sm text-ink-2">
                    <span className="truncate">{f.name}</span>
                    <Button type="button" variant="ghost" size="sm" aria-label={`Retirer ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                      <X className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => picker.current?.click()}>
              <Plus className="h-4 w-4" /> {files.length > 0 ? "Ajouter d’autres documents" : "Ajouter des documents"}
            </Button>
            <HiddenFileInput inputRef={picker} onFiles={(picked) => setFiles([...files, ...Array.from(picked)])} />
          </div>
          <Button className="mt-4" disabled={busy || (note.trim() ? !title.trim() : files.length === 0)} onClick={() => void deposit()}>
            {busy ? "Dépôt en cours…" : "Déposer dans la mémoire"}
          </Button>
        </section>
      )}

      {list?.items.length === 0 && <p className="mt-6 rounded-[22px] border border-line bg-surface p-8 text-center text-sm text-ink-3">La mémoire est vide pour l’instant.</p>}

      <ul className="mt-5 space-y-3">
        {list?.items.map((item) => (
          <li key={item.id} className="rounded-[22px] border border-line bg-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-bold text-ink">{item.title}</h3>
                <p className="text-[13px] text-ink-3">
                  {unitName(item.unit)} ·{" "}
                  {item.kind === "document" ? (
                    <a href={`/api/memory/items/${item.id}/file`} download className="font-semibold text-brand-ink underline-offset-2 hover:underline">
                      {item.fileName ?? "Document"}
                    </a>
                  ) : item.kind === "note" ? (
                    "Note"
                  ) : (
                    "Site web"
                  )}
                </p>
              </div>
              <Badge variant={item.active ? STATUS[item.status].variant : "muted"}>{item.active ? STATUS[item.status].label : "Désactivé"}</Badge>
            </div>
            {item.error && item.active && <p className="mt-2 text-sm text-ink-3">{item.error}</p>}
            {item.note && <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-ink-2">{item.note}</p>}
            {item.canEdit && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => void patch(item, { active: !item.active })}>
                  {item.active ? "Désactiver" : "Réactiver"}
                </Button>
                <Button variant="ghost" size="sm" className="text-ko" onClick={() => setRemoving(item)}>
                  Supprimer
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Supprimer « ${removing?.title ?? ""} » ?`}
        description="Il est effacé de la mémoire des experts. Cette action est définitive."
        confirmText="Supprimer"
        destructive
        onConfirm={async () => {
          if (!removing) return;
          await apiFetch(`/api/memory/items/${removing.id}`, { method: "DELETE" });
          await load();
        }}
      />
    </div>
  );
}
