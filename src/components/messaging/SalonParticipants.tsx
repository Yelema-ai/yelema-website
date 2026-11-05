"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { salonPeople, shortName, type BuzzEntry } from "@/lib/buzz";
import { cn } from "@/lib/utils";
import { ParticipantAvatar } from "@/components/messaging/ParticipantAvatar";

// L'onglet « Participants » d'un salon : une ligne par personne, vous en tête, ses Experts présents en petits
// visages ; un clic la déplie pour les nommer. Qui est là se lit d'un coup d'œil, sans tout dérouler.
export function SalonParticipants({ members, directory, mine }: { members: string[]; directory: BuzzEntry[]; mine: string[] }) {
  const groups = useMemo(() => salonPeople(directory, members, mine), [directory, members, mine]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const people = groups.filter((g) => g.person).length;
  const experts = groups.reduce((n, g) => n + g.experts.length, 0);
  const toggle = (m: string) => setOpen((s) => (s.has(m) ? new Set([...s].filter((x) => x !== m)) : new Set([...s, m])));
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
      <p className="text-[13px] text-ink-3">
        {people} membre{people > 1 ? "s" : ""} de l’équipe, {experts} Expert{experts > 1 ? "s" : ""} IA
      </p>
      {groups.length === 0 && <p className="mt-3 text-sm text-ink-3">Personne d’autre n’est encore dans ce salon.</p>}
      <ul className="mt-3 overflow-hidden rounded-card border border-line bg-surface">
        {groups.map((g) => {
          const unfolded = open.has(g.membre);
          return (
            <li key={g.membre} className="border-b border-line last:border-0">
              <button
                type="button"
                onClick={() => g.experts.length && toggle(g.membre)}
                aria-expanded={g.experts.length ? unfolded : undefined}
                className={cn("flex min-h-14 w-full items-center gap-3 px-3.5 py-2.5 text-left", g.experts.length > 0 && "hover:bg-soft")}
              >
                <ParticipantAvatar entry={g.person ?? directory.find((e) => e.type === "personne" && e.membre === g.membre) ?? null} name={g.nom} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">
                    {g.nom}
                    {g.self && <span className="font-normal text-ink-3"> (vous)</span>}
                  </span>
                  <span className="block truncate text-xs text-ink-3">
                    {!g.person ? "Ses Experts IA seulement" : g.experts.length ? `Membre de l’équipe, ${g.experts.length} Expert${g.experts.length > 1 ? "s" : ""} IA` : "Membre de l’équipe"}
                  </span>
                </span>
                {g.experts.length > 0 && !unfolded && (
                  <span className="flex shrink-0 -space-x-2" aria-hidden>
                    {g.experts.slice(0, 4).map((e) => (
                      <ParticipantAvatar key={e.cles[0]} entry={e} name={e.nom} size="xxs" className="rounded-full ring-2 ring-surface" />
                    ))}
                    {g.experts.length > 4 && <span className="grid size-6 place-items-center rounded-full bg-soft-2 text-[10px] font-bold text-ink-2 ring-2 ring-surface">+{g.experts.length - 4}</span>}
                  </span>
                )}
                {g.experts.length > 0 && <ChevronDown className={cn("size-4 shrink-0 text-ink-3 transition-transform", unfolded && "rotate-180")} />}
              </button>
              {unfolded && (
                <ul className="space-y-1 pb-2.5 pl-[58px] pr-3.5">
                  {g.experts.map((e) => (
                    <li key={e.cles[0]} className="flex min-h-9 items-center gap-2.5">
                      <ParticipantAvatar entry={e} name={e.nom} size="xs" />
                      <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">{shortName(e.nom)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
