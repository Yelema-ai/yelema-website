"use client";

import type { OrgMember, OrgPlacement, OrgRole } from "@/lib/memory";
import type { UnitCounts } from "@/lib/org-chart";
import { cn } from "@/lib/utils";
import { memberName, type Org } from "./context";
import { CARD, count, FIELD, HEADING, LINK, LINK_KO } from "./styles";

const ROLES: { value: OrgRole; label: string }[] = [
  { value: "member", label: "Membre" },
  { value: "head", label: "Responsable" },
];

type Row = { member: OrgMember; place: OrgPlacement };

/** The detail of one box of the tree: who is in it, people and experts, and every gesture without dragging. */
export function UnitPanel({ org, company, unitId, counts, onClose }: { org: Org; company: string; unitId: string | null; counts: Map<string | null, UnitCounts>; onClose: () => void }) {
  const { chart, editable } = org;
  const unit = unitId == null ? null : chart.units.find((u) => u.id === unitId);
  if (unitId != null && !unit) return null;

  const here: Row[] = chart.members.flatMap((member) => member.units.filter((p) => p.unit === unitId).map((place) => ({ member, place })));
  const members = here.filter((r) => r.place.profile == null);
  const experts = here.filter((r) => r.place.profile != null);
  const unplaced = chart.members.filter((m) => !m.units.some((p) => p.profile == null));
  const docs = counts.get(unitId)?.documents ?? 0;
  const expertLabel = (r: Row) => r.member.experts.find((x) => x.profile === r.place.profile)?.label ?? r.place.profile ?? "";

  const row = (r: Row, label: string, sub: string) => (
    <li key={r.place.id} className="flex items-center justify-between gap-2 text-[13px]">
      <span className="min-w-0">
        <span className="block truncate font-semibold text-ink">{label}</span>
        <span className="block truncate text-xs text-ink-3">{sub}</span>
      </span>
      {editable ? (
        <span className="flex shrink-0 items-center gap-2">
          <select aria-label={`Rôle de ${label}`} className={FIELD} value={r.place.role} onChange={(e) => void org.setRole(r.place.id, e.target.value as OrgRole)}>
            {ROLES.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
          <button type="button" className={LINK_KO} onClick={() => void org.change(`/api/org/assignments/${r.place.id}`, "DELETE", undefined, "Retiré du département.")}>
            Retirer
          </button>
        </span>
      ) : (
        <span className="shrink-0 rounded-full bg-soft px-2 py-0.5 text-xs text-ink-2">{ROLES.find((x) => x.value === r.place.role)?.label}</span>
      )}
    </li>
  );

  return (
    <aside aria-label={unit ? `Département ${unit.name}` : company} className={cn(CARD, "max-h-[640px] w-full overflow-y-auto p-4 lg:w-[320px] lg:shrink-0")}>
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-[16px] font-bold text-ink [overflow-wrap:anywhere]">{unit ? unit.name : company}</h2>
        <button type="button" className={LINK} onClick={onClose}>
          Fermer
        </button>
      </div>

      {unit ? (
        <>
          <div className={HEADING}>Membres ({members.length})</div>
          {members.length ? <ul className="grid gap-2">{members.map((r) => row(r, memberName(r.member), "Tous ses Experts"))}</ul> : <p className="text-xs text-ink-3">Aucun membre.</p>}
          <div className={HEADING}>Experts ajoutés seuls ({experts.length})</div>
          {experts.length ? (
            <ul className="grid gap-2">{experts.map((r) => row(r, expertLabel(r), `Expert de ${memberName(r.member)}`))}</ul>
          ) : (
            <p className="text-xs text-ink-3">Aucun expert ajouté seul.</p>
          )}
          {editable && (
            <select
              aria-label={`Ajouter à ${unit.name}`}
              className={cn(FIELD, "mt-3 w-full")}
              value=""
              onChange={(e) => {
                const [member, profile] = e.target.value.split("|");
                if (member) void org.assign(unit.id, member, profile || null);
              }}
            >
              <option value="">+ Ajouter une personne ou un Expert</option>
              <optgroup label="Un membre et ses Experts">
                {chart.members
                  .filter((m) => !members.some((r) => r.member.id === m.id))
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {memberName(m)}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Un Expert seul">
                {chart.members.flatMap((m) =>
                  m.experts
                    .filter((x) => !experts.some((r) => r.member.id === m.id && r.place.profile === x.profile))
                    .map((x) => (
                      <option key={`${m.id}|${x.profile}`} value={`${m.id}|${x.profile}`}>
                        {`${x.label}, expert de ${memberName(m)}`}
                      </option>
                    ))
                )}
              </optgroup>
            </select>
          )}
        </>
      ) : (
        <>
          <div className={HEADING}>Sans département ({unplaced.length})</div>
          <p className="text-xs text-ink-3">Ils ne lisent que ce qui est pour toute l’entreprise.</p>
          <ul className="mt-2 grid gap-1 text-[13px] text-ink">
            {unplaced.map((m) => (
              <li key={m.id}>{memberName(m)}</li>
            ))}
          </ul>
        </>
      )}

      <div className={HEADING}>Documents</div>
      <p className="text-xs text-ink-3">
        {docs > 0
          ? `${count(docs, "document")} ${unit ? `réservé${docs > 1 ? "s" : ""} à ce département` : "pour toute l’entreprise"}, à voir dans Entreprise.`
          : unit
            ? "Aucun document réservé à ce département."
            : "Aucun document pour toute l’entreprise."}
      </p>
    </aside>
  );
}
