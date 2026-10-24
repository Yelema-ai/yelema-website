"use client";

import { useState } from "react";
import { ChevronDown, MoreHorizontal } from "lucide-react";
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
}

// The deposits, one folding block per compartment (the first open), 10 to a page.
export function MemoryGroups({ list, ...actions }: { list: MemoryList } & ItemActions) {
  const groups = groupByUnit(list.items, list.units);
  return (
    <div className="mt-5 space-y-3">
      {groups.map((g, i) => (
        <Group key={g.unit ?? ""} name={g.name} items={g.items} defaultOpen={i === 0} {...actions} />
      ))}
    </div>
  );
}

function Group({ name, items, defaultOpen, ...actions }: { name: string; items: MemoryItem[]; defaultOpen: boolean } & ItemActions) {
  const [open, setOpen] = useState(defaultOpen);
  const [page, setPage] = useState(1);
  const shown = paginate(items, page, PER_PAGE);
  return (
    <section className="rounded-[22px] border border-line bg-surface">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2 px-5 py-4 text-left">
        <h3 className="font-bold text-ink">{name}</h3>
        <span className="rounded-full bg-soft px-2 py-0.5 text-xs font-semibold text-ink-2">{items.length}</span>
        <ChevronDown className={cn("ml-auto h-4 w-4 text-ink-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="border-t border-line px-5 pb-4">
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

function Item({ item, onToggle, onRemove }: { item: MemoryItem } & ItemActions) {
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
            ) : (
              "Site web"
            )}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Badge variant={item.active ? STATUS[item.status].variant : "muted"}>{item.active ? STATUS[item.status].label : "Désactivé"}</Badge>
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
