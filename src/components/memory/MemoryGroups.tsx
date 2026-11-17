"use client";

import { useState } from "react";
import { ChevronDown, FileText, Globe, MoreHorizontal, NotebookPen, Plus } from "lucide-react";
import { groupByUnit, type MemoryItem, type MemoryList, type MemoryStatus } from "@/lib/memory";
import { paginate } from "@/lib/paginate";
import { cn } from "@/lib/utils";
import { Pager } from "@/components/Pager";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const STATUS: Record<MemoryStatus, { label: string; variant: "success" | "warning" | "muted" | "destructive" }> = {
  pending: { label: "Envoi en cours", variant: "warning" },
  synced: { label: "Lisible par les Experts", variant: "success" },
  skipped: { label: "Non envoyé", variant: "muted" },
  error: { label: "Envoi impossible", variant: "destructive" },
};
const PER_PAGE = 10;

interface ItemActions {
  onToggle: (item: MemoryItem) => void;
  onRemove: (item: MemoryItem) => void;
  /** A new file for a document: the old one is kept as its previous version. */
  onNewVersion?: (item: MemoryItem) => void;
}

type AddKind = "note" | "documents" | "site";

// One line per department the member reads, empty ones too, so it is plain where a document may go
// (Leslie, 06/11, option B): its count, its own « + » (a note, documents, a site, for that department),
// and its documents folded under it. The first line with documents is open.
export function MemoryGroups({
  list,
  onAdd,
  ...actions
}: { list: MemoryList; onAdd?: (unit: string | null, kind: AddKind) => void } & ItemActions) {
  const groups = groupByUnit(list.items, list.units, true);
  const firstFull = groups.findIndex((g) => g.items.length > 0);
  const canAdd = (unit: string | null) => (unit === null ? list.canDepositForAll : (list.units.find((u) => u.id === unit)?.canDeposit ?? false));
  return (
    <div className="mt-5 divide-y divide-line overflow-hidden rounded-[22px] border border-line bg-surface">
      {groups.map((g, i) => (
        <Group
          key={g.unit ?? ""}
          name={g.name}
          items={g.items}
          defaultOpen={i === firstFull}
          onAdd={onAdd && canAdd(g.unit) ? (kind) => onAdd(g.unit, kind) : undefined}
          {...actions}
        />
      ))}
    </div>
  );
}

function Group({
  name,
  items,
  defaultOpen,
  onAdd,
  ...actions
}: { name: string; items: MemoryItem[]; defaultOpen: boolean; onAdd?: (kind: AddKind) => void } & ItemActions) {
  const [open, setOpen] = useState(defaultOpen);
  const [page, setPage] = useState(1);
  const shown = paginate(items, page, PER_PAGE);
  const empty = items.length === 0;
  const count = empty ? "Rien pour l’instant" : items.length === 1 ? "1 document" : `${items.length} documents`;
  return (
    <section>
      <div className="flex min-h-16 items-center gap-2 pl-5 pr-3">
        {empty ? (
          <h3 className="min-w-0 flex-1 truncate py-4 font-semibold text-ink-3">{name}</h3>
        ) : (
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 py-4 text-left">
            <h3 className="truncate font-bold text-ink">{name}</h3>
          </button>
        )}
        <span className={cn("shrink-0 text-[13px]", empty ? "text-ink-3" : "text-ink-2")}>{count}</span>
        {onAdd && (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Ajouter pour ${name}`}
                className="grid size-11 shrink-0 place-items-center rounded-full text-brand-ink hover:bg-tint"
              >
                <span className="grid size-8 place-items-center rounded-full border border-line bg-surface">
                  <Plus className="h-4 w-4" />
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52">
              <DropdownMenuItem onSelect={() => onAdd("note")}>
                <NotebookPen className="size-4 text-ink-3" /> Une note
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onAdd("documents")}>
                <FileText className="size-4 text-ink-3" /> Des documents
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onAdd("site")}>
                <Globe className="size-4 text-ink-3" /> Un site web
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {empty ? (
          <span className="size-9 shrink-0" aria-hidden />
        ) : (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? `Replier ${name}` : `Déplier ${name}`}
            className="grid size-9 shrink-0 place-items-center rounded-lg text-ink-3 hover:bg-soft hover:text-ink"
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
          </button>
        )}
      </div>
      {open && !empty && (
        <div className="border-t border-line bg-soft/40 px-5 pb-3">
          <ul className="divide-y divide-line">
            {shown.items.map((item) => (
              <Item key={item.id} item={item} {...actions} />
            ))}
          </ul>
          <Pager page={shown} total={items.length} size={PER_PAGE} onPage={setPage} />
        </div>
      )}
    </section>
  );
}

function Item({ item, onToggle, onRemove, onNewVersion }: { item: MemoryItem } & ItemActions) {
  return (
    <li className="py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="font-semibold text-ink">{item.title}</h4>
          <p className="text-[13px] text-ink-3">
            {item.kind === "document" ? (
              <a href={`/api/memory/items/${item.id}/file`} download className="font-semibold text-brand-ink underline-offset-2 hover:underline">
                {item.fileName ?? "Document"}
              </a>
            ) : item.kind === "note" ? (
              "Note"
            ) : item.url ? (
              <>
                <a href={item.url} target="_blank" rel="noreferrer" className="font-semibold text-brand-ink underline-offset-2 hover:underline">
                  {item.url.replace(/^https?:\/\//, "")}
                </a>
                , relu chaque semaine
              </>
            ) : (
              "Site web"
            )}
            {item.kind === "document" && item.version && item.version > 1 && <span>, version {item.version}</span>}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {/* Read by the Experts is the normal case: only what differs is said (Leslie, 06/11). */}
          {(!item.active || item.status !== "synced") && (
            <Badge variant={item.active ? STATUS[item.status].variant : "muted"}>{item.active ? STATUS[item.status].label : "Désactivé"}</Badge>
          )}
          {/* Its two actions in a « … » menu, as on the other lists: not two buttons on every row. */}
          {item.canEdit && (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`Actions sur ${item.title}`}
                  className="grid size-8 place-items-center rounded-lg text-ink-3 hover:bg-soft hover:text-ink"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {item.kind === "document" && onNewVersion && (
                  <DropdownMenuItem onSelect={() => onNewVersion(item)}>Déposer une nouvelle version</DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => onToggle(item)}>{item.active ? "Désactiver" : "Réactiver"}</DropdownMenuItem>
                <DropdownMenuItem className="text-ko" onSelect={() => onRemove(item)}>
                  Supprimer
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      {item.error && item.active && <p className="mt-2 text-sm text-ink-3">{item.error}</p>}
      {item.note && <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-ink-2">{item.note}</p>}
    </li>
  );
}
