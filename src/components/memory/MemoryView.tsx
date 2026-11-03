"use client";

import { Picker } from "@/components/ui/picker";
import { useCallback, useEffect, useRef, useState } from "react";
import { Globe, Loader2, Palette, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, readApiError } from "@/lib/api";
import type { MemoryItem, MemoryList } from "@/lib/memory";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { HiddenFileInput } from "@/components/HiddenFileInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MemoryGroups } from "./MemoryGroups";
import Link from "next/link";
import { useExpertsContext } from "@/components/experts/ExpertsProvider";
import { usePoll } from "@/components/usePoll";
import { runPool } from "@/lib/bulk";
import { driveTree } from "@/lib/drive-store";

// The company memory: what the experts know of the company. Everyone sees the deposits of their own
// compartments; whoever may deposit adds a note or a document. The back office sends each deposit
// to the memory in the background and applies the org chart on every question an expert asks.

const ALL = "";
const FIELD = "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm font-normal text-ink focus-visible:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/15";

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
  const [sites, setSites] = useState<string[]>([]);
  const [site, setSite] = useState("");
  const picker = useRef<HTMLInputElement>(null);
  const chartePicker = useRef<HTMLInputElement>(null);
  const versionPicker = useRef<HTMLInputElement>(null);
  const [versionOf, setVersionOf] = useState<MemoryItem | null>(null);

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
  usePoll(load, { everyMs: 5_000, immediate: false, enabled: waiting });

  const targets = [...(list?.canDepositForAll ? [{ id: ALL, name: "Toute l’entreprise" }] : []), ...(list?.units.filter((u) => u.canDeposit) ?? [])];
  // The first compartment the member may deposit in, while none is chosen.
  const target = targets.some((t) => t.id === unit) ? unit : (targets[0]?.id ?? ALL);

  // The company's brand book, always on top: the Experts apply it to every deliverable (Leslie, 01/11).
  const charte = list?.items.find((i) => i.kind === "document" && /charte/i.test(i.title)) ?? null;
  // No brand book yet: Koffi (Design & Création) can make one with his /charte command (Leslie, 01/11).
  const { experts } = useExpertsContext();
  const designer = experts.find((e) =>
    [e.catalogueKey, e.driveFolder, e.profileId].some((k) => k && k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes("koffi"))
  );
  // Koffi delivers the brand book in his Livrables (a file named « Charte… »); the admin makes it the
  // company's in one click (Leslie, 01/11: Koffi writes nothing in the memory himself). Shown while
  // there is no charte, or when his file is newer than the one deposited.
  const [made, setMade] = useState<{ path: string; name: string; modified: number } | null>(null);
  const [copying, setCopying] = useState(false);
  useEffect(() => {
    if (!designer) return;
    const plain = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const folders = [designer.driveFolder, designer.displayName, "koffi"].filter(Boolean).map((f) => plain(String(f)));
    driveTree(designer.agentId)
      .then((tree) => {
        const found = tree.entries
          .filter((e) => e.type === "file" && /charte/i.test(e.name) && folders.some((f) => plain(e.path).includes(`/livrables/${f}/`)))
          .sort((a, b) => Number(/\.pdf$/i.test(b.name)) - Number(/\.pdf$/i.test(a.name)) || b.modified - a.modified)[0];
        setMade(found ? { path: found.path, name: found.name, modified: found.modified } : null);
      })
      .catch(() => setMade(null));
  }, [designer]);
  const charteAt = charte?.sentAt ? Date.parse(charte.sentAt) / 1000 : 0;
  const offer = made && (!charte || (charteAt > 0 && made.modified > charteAt + 60)) ? made : null;
  async function adoptCharte() {
    if (!offer || !designer) return;
    setCopying(true);
    try {
      await apiFetch("/api/memory/charte", { method: "POST", body: JSON.stringify({ agentId: designer.agentId, path: offer.path, replace: charte?.id ?? null }) });
      toast.success("C’est la charte de l’entreprise : vos Experts l’appliquent désormais.");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCopying(false);
    }
  }

  async function depositCharte(file: File) {
    if (charte) return newVersion(charte, file);
    const form = new FormData();
    form.set("title", "Charte graphique");
    form.set("file", file);
    const res = await fetch("/api/memory/items", { method: "POST", body: form });
    if (!res.ok) toast.error(await readApiError(res, "la charte n’a pas pu être déposée."));
    await load();
  }

  // A new file for a deposited document: the back office keeps the old one as the previous version.
  async function newVersion(item: MemoryItem, file: File) {
    const form = new FormData();
    form.set("file", file);
    const res = await fetch(`/api/memory/items/${item.id}/versions`, { method: "POST", body: form });
    if (!res.ok) toast.error(await readApiError(res, "la nouvelle version n’a pas pu être déposée."));
    else toast.success(`${item.title} : nouvelle version déposée`);
    await load();
  }

  // A typed address becomes a site to add; several sites may go at once.
  function addSite() {
    const v = site.trim();
    if (!v) return;
    const url = /^https?:\/\//i.test(v) ? v : `https://${v}`;
    if (!sites.includes(url)) setSites([...sites, url]);
    setSite("");
  }

  // The note, then each site, then each document on its own: a document takes the title only when it is alone.
  async function deposit() {
    setBusy(true);
    const failed: File[] = [];
    try {
      for (const url of sites) {
        await apiFetch("/api/memory/items", { method: "POST", body: JSON.stringify({ title: new URL(url).hostname.replace(/^www\./, ""), url, unit: target === ALL ? null : target }) });
      }
      setSites([]);
      if (note.trim()) {
        await apiFetch("/api/memory/items", { method: "POST", body: JSON.stringify({ title, note, unit: target === ALL ? null : target }) });
        setTitle("");
        setNote("");
      }
      // Three documents at a time; the ones refused stay in the picker, in their order.
      const sent = await runPool(files, 3, async (file) => {
        const form = new FormData();
        form.set("title", (files.length === 1 && !note.trim() && title.trim()) || file.name);
        if (target !== ALL) form.set("unit", target);
        form.set("file", file);
        const res = await fetch("/api/memory/items", { method: "POST", body: form });
        if (!res.ok) toast.error(`${file.name} : ${await readApiError(res, "le document n’a pas pu être déposé.")}`);
        return res.ok;
      });
      sent.forEach((r, i) => {
        if (r.status === "rejected") toast.error(`${files[i].name} : ${(r.reason as Error).message}`);
        if (r.status === "rejected" || !r.value) failed.push(files[i]);
      });
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
        Ce que vos Experts savent de l’entreprise : règles, procédures, documents de référence. Chaque Expert ne lit que les compartiments ouverts à son utilisateur par l’organigramme.
      </p>

      {error && <p className="mt-4 max-w-xl rounded-xl bg-ko-pale px-4 py-3 text-sm text-ko">{error}</p>}
      {!list && !error && <Loader2 className="mt-6 h-5 w-5 animate-spin text-ink-3" aria-label="Chargement" />}

      {list && list.canDepositForAll && (
        <section className="mt-5 flex flex-wrap items-center gap-4 rounded-[22px] border border-line bg-surface p-5 sm:p-6">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-tint text-brand-ink">
            <Palette className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1 basis-52">
            <h2 className="text-lg font-bold text-ink">Charte graphique</h2>
            {offer && designer ? (
              <p className="text-[13px] text-ink-3">
                {designer.displayName} a {charte ? "préparé une nouvelle version" : "préparé votre charte"} :{" "}
                <a
                  href={`/api/agents/${designer.agentId}/files/content?path=${encodeURIComponent(offer.path)}&disposition=inline`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-brand-ink underline-offset-2 hover:underline"
                >
                  {offer.name}
                </a>
                .
              </p>
            ) : charte ? (
              <p className="text-[13px] text-ink-3">
                <a href={`/api/memory/items/${charte.id}/file`} download className="font-semibold text-brand-ink underline-offset-2 hover:underline">
                  {charte.fileName ?? "Charte"}
                </a>
                {charte.version && charte.version > 1 ? `, version ${charte.version}` : ""}. Vos Experts l’appliquent à chaque livrable.
              </p>
            ) : (
              <p className="text-[13px] text-ink-3">
                Logo, couleurs, polices : vos Experts l’appliquent à chaque livrable.
                {designer ? ` Pas de charte ? ${designer.displayName} la crée, à partir de votre site s’il existe.` : ""}
              </p>
            )}
          </div>
          <div className="flex gap-2 max-sm:w-full max-sm:flex-col">
            {offer && (
              <Button size="sm" className="max-sm:w-full" disabled={copying} onClick={() => void adoptCharte()}>
                {copying && <Loader2 className="h-4 w-4 animate-spin" />}
                En faire la charte de l’entreprise
              </Button>
            )}
            {!charte && !offer && designer && (
              <Button asChild size="sm" className="max-sm:w-full">
                <Link href={`/experts/${designer.agentId}/${designer.profileId}/chat?q=${encodeURIComponent("/charte")}`}>
                  La créer avec {designer.displayName}
                </Link>
              </Button>
            )}
            <Button variant="outline" size="sm" className="max-sm:w-full" onClick={() => chartePicker.current?.click()}>
              {charte ? "Remplacer" : "Déposer la charte"}
            </Button>
          </div>
          <HiddenFileInput inputRef={chartePicker} onFiles={(picked) => picked[0] && void depositCharte(picked[0])} />
        </section>
      )}

      {list && targets.length > 0 && (
        <section className="mt-5 rounded-[22px] border border-line bg-surface p-5 sm:p-6" aria-busy={busy}>
          <h2 className="text-lg font-bold text-ink">Déposer</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-[13px] font-semibold text-ink-3">
              Titre
              <Input className="mt-1" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <div className="text-[13px] font-semibold text-ink-3">
              Lisible par
              <Picker
                label="Lisible par"
                placeholder="Toute l’entreprise"
                value={target}
                onChange={setUnit}
                groups={[{ options: targets.map((t) => ({ value: t.id, label: t.name })) }]}
                className="mt-1 w-full sm:h-10"
              />
            </div>
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
          <div className="mt-4">
            <p className="text-[13px] font-semibold text-ink-3">Sites web (relus chaque semaine)</p>
            {sites.length > 0 && (
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {sites.map((u) => (
                  <li key={u} className="inline-flex max-w-full items-center gap-1 rounded-full bg-soft py-1 pl-3 pr-1 text-sm text-ink-2">
                    <Globe className="h-3.5 w-3.5 shrink-0 text-ink-3" />
                    <span className="truncate">{u.replace(/^https?:\/\//, "")}</span>
                    <button type="button" aria-label={`Retirer ${u}`} onClick={() => setSites(sites.filter((x) => x !== u))} className="grid size-6 place-items-center rounded-full hover:bg-soft-2">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 flex gap-2">
              <Input
                value={site}
                placeholder="unifood.ci"
                aria-label="Adresse d’un site web"
                onChange={(e) => setSite(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSite();
                  }
                }}
                className="max-w-sm"
              />
              <Button type="button" variant="outline" size="sm" className="h-10" disabled={!site.trim()} onClick={addSite}>
                <Plus className="h-4 w-4" /> Ajouter
              </Button>
            </div>
          </div>
          {/* Greyed out until there is something to deposit, rather than a faded colour that reads as broken. */}
          <Button
            className="mt-4"
            variant={note.trim() || files.length > 0 || sites.length > 0 ? "default" : "outline"}
            disabled={busy || (note.trim() ? !title.trim() : files.length === 0 && sites.length === 0)}
            onClick={() => void deposit()}
          >
            {busy ? "Dépôt en cours…" : "Déposer dans la mémoire"}
          </Button>
        </section>
      )}

      {list?.items.length === 0 && <p className="mt-6 rounded-[22px] border border-line bg-surface p-8 text-center text-sm text-ink-3">La mémoire est vide pour l’instant.</p>}

      {list && list.items.length > 0 && (
        <MemoryGroups
          list={list}
          onToggle={(item) => void patch(item, { active: !item.active })}
          onRemove={setRemoving}
          onNewVersion={(item) => {
            setVersionOf(item);
            versionPicker.current?.click();
          }}
        />
      )}
      <HiddenFileInput inputRef={versionPicker} onFiles={(picked) => versionOf && picked[0] && void newVersion(versionOf, picked[0])} />

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Supprimer « ${removing?.title ?? ""} » ?`}
        description="Il est effacé de la mémoire des Experts. Cette action est définitive."
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
