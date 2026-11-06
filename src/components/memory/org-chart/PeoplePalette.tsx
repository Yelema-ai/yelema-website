"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { initials, memberName, type Org } from "./context";
import { CARD, count, FIELD } from "./styles";

/** The members and their experts, to drag onto a department of the tree: each drop adds a place. */
export function PeoplePalette({ org }: { org: Org }) {
  const { chart, editable } = org;
  const [filter, setFilter] = useState("");
  const q = filter.trim().toLowerCase();
  const people = chart.members.filter((m) => !q || memberName(m).toLowerCase().includes(q) || m.experts.some((e) => e.label.toLowerCase().includes(q)));
  const unitsOf = (m: (typeof people)[number], profile: string | null) => m.units.filter((p) => p.profile === profile).length;

  return (
    <aside aria-label="Membres et Experts" className={cn(CARD, "max-h-[640px] w-full overflow-y-auto p-3 lg:w-[260px] lg:shrink-0")}>
      <h2 className="text-[14px] font-bold text-ink">Membres et Experts</h2>
      <p className="mb-2 mt-0.5 text-xs text-ink-3">{editable ? "Glissez une personne, ou un de ses Experts seul, sur un département." : "Lecture seule."}</p>
      {chart.members.length > 8 && (
        <input aria-label="Filtrer les membres" placeholder="Filtrer…" value={filter} onChange={(e) => setFilter(e.target.value)} className={cn(FIELD, "mb-2 w-full")} />
      )}
      {people.length === 0 && <p className="text-xs text-ink-3">Aucun membre.</p>}
      <ul className="grid gap-2">
        {people.map((m) => {
          const n = unitsOf(m, null);
          const name = memberName(m);
          return (
            <li key={m.id} className="rounded-xl border border-line bg-surface p-1.5">
              <div
                draggable={editable}
                onDragStart={(e) => org.dragStart(e, { kind: "member", member: m.id })}
                title="Le membre et tous ses Experts"
                className={cn("flex items-center gap-2 rounded-lg px-1 py-1", editable && "cursor-grab hover:bg-soft")}
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-tint text-[10.5px] font-bold text-brand-ink">{initials(name)}</span>
                <span className="min-w-0 grow">
                  <span className={cn("block truncate text-[13px] font-semibold", n ? "text-ink" : "text-ink-3")}>{name}</span>
                  <span className="block text-[12px] text-ink-3">{n ? count(n, "département") : "Sans département"}</span>
                </span>
              </div>
              {m.experts.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1 pl-1">
                  {m.experts.map((x) => {
                    const own = unitsOf(m, x.profile);
                    return (
                      <span
                        key={x.profile}
                        draggable={editable}
                        onDragStart={(e) => org.dragStart(e, { kind: "expert", member: m.id, profile: x.profile })}
                        title={own ? `${x.label} seul : ${count(own, "département")}` : `${x.label} seul (sinon, suit ${name.split(" ")[0]})`}
                        className={cn(
                          "inline-flex h-7 items-center gap-1 rounded-full border px-2 text-[12px] font-semibold",
                          own ? "border-brand/30 bg-tint text-brand-ink" : "border-line bg-soft text-ink-2",
                          editable && "cursor-grab"
                        )}
                      >
                        <Sparkles className="size-3" /> {x.label}
                      </span>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
