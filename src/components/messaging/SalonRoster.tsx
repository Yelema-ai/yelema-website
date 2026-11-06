"use client";

import { useMemo } from "react";
import { salonRoster, shortName, type BuzzEntry, type RosterRow, type SalonRole } from "@/lib/buzz";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { useCatalogue } from "@/components/experts/useCatalogue";
import { ParticipantAvatar } from "@/components/messaging/ParticipantAvatar";

/** `createur`: the member who opened the salon, null when not recorded; `unit`: a salon that follows the org chart. */
export interface RosterContext { createur: string | null; unit: boolean }

const PILL: Record<SalonRole, { label: string; className: string }> = {
  proprietaire: { label: "Propriétaire", className: "bg-tint text-brand-ink" },
  admin: { label: "Admin", className: "bg-ok-pale text-ok" },
  membre: { label: "Membre", className: "bg-soft text-ink-3" },
  expert: { label: "Expert", className: "bg-tint text-brand" },
  invite: { label: "Invité", className: "bg-coral-pale text-coral-ink" },
};

export function RoleBadge({ role }: { role: SalonRole }) {
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${PILL[role].className}`}>{PILL[role].label}</span>;
}

const until = (iso: string | undefined): string | null => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? `jusqu’au ${d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}` : null;
};

// L'onglet « Participants » d'un salon, vu d'un membre : qui est là et ce que chacun peut y faire.
export function SalonRoster({ members, directory, mine, context }: { members: string[]; directory: BuzzEntry[]; mine: string[]; context: RosterContext }) {
  const { current } = useWorkspace();
  const { catalogue } = useCatalogue(current?.id);
  const createur = context.unit ? null : context.createur;
  const rows = useMemo(() => salonRoster(directory, members, mine, createur), [directory, members, mine, createur]);
  const pronoun = (e: BuzzEntry) => catalogue.experts.find((c) => c.key === e.profil)?.pronoun ?? null;
  const detail = (r: RosterRow): string | null => {
    if (r.role === "invite") return until(r.entry.expiresAt);
    if (r.role !== "expert") return null;
    return r.owner ? `${pronoun(r.entry) === "elle" ? "experte" : "expert"} de ${r.owner}` : null;
  };
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
      <p className="text-[13px] text-ink-3">
        {context.unit
          ? "Salon d’unité : il suit l’organigramme et n’accueille pas de personnes externes. Les experts ne répondent qu’à leur propriétaire."
          : "Le propriétaire du salon et les admins peuvent inviter des personnes externes, prolonger ou retirer leur accès. Les experts ne répondent qu’à leur propriétaire."}
      </p>
      {!context.unit && !context.createur && <p className="mt-1 text-[13px] text-ink-3">Propriétaire non enregistré pour ce salon : seuls les admins gèrent les invités.</p>}
      {rows.length === 0 && <p className="mt-3 text-sm text-ink-3">Personne d’autre n’est encore dans ce salon.</p>}
      {rows.length > 0 && (
        <ul className="mt-3 overflow-hidden rounded-card border border-line bg-surface">
          {rows.map((r) => {
            const sub = detail(r);
            const name = r.role === "expert" ? shortName(r.entry.nom) : r.entry.nom;
            return (
              <li key={`${r.role}:${r.entry.cles[0] ?? r.entry.membre}`} className="flex min-h-14 items-center gap-3 border-b border-line px-3.5 py-2.5 last:border-0">
                <ParticipantAvatar entry={r.entry} name={name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">
                    {name}
                    {sub && r.role === "expert" && <span className="font-normal text-ink-3"> · {sub}</span>}
                    {r.self && <span className="font-normal text-ink-3"> (vous)</span>}
                  </span>
                  {sub && r.role === "invite" && <span className="block truncate text-xs text-ink-3">{sub}</span>}
                </span>
                <RoleBadge role={r.role} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
