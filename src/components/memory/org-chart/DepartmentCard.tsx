"use client";

import { Check, ChevronDown, CornerDownRight, MoreHorizontal, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import type { OrgMember, OrgPlacement, OrgRole, OrgUnit } from "@/lib/memory";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ExpertImage } from "@/components/experts/ExpertImage";
import { useExpertsContext } from "@/components/experts/ExpertsProvider";
import type { DragItem } from "@/lib/org-chart";
import { cn } from "@/lib/utils";
import { initials, memberName, type Org } from "./context";
import { CARD, count } from "./styles";

type Row = { member: OrgMember; place: OrgPlacement };

const ROLE_LABEL: Record<OrgRole, string> = { head: "Responsable", member: "Membre" };

/** A person's or an expert's actions in a department, in one « … »: their role, then Retirer. */
function RowMenu({ role, label, onRole, onRemove }: { role: OrgRole; label: string; onRole: (role: OrgRole) => void; onRemove: () => void }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`Actions pour ${label}`} className="grid size-9 shrink-0 place-items-center rounded-full text-ink-3 opacity-70 hover:bg-soft hover:text-ink group-hover:opacity-100">
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {(["head", "member"] as const).map((r) => (
          <DropdownMenuItem key={r} onSelect={() => r !== role && onRole(r)}>
            {r === role ? <Check className="size-4 text-brand" /> : <span className="size-4" />} {ROLE_LABEL[r]}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onRemove}>
          <Trash2 /> Retirer du département
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A round face: the expert's picture when the catalogue has one, else initials. */
function Face({ name, photo, expert = false }: { name: string; photo?: string | null; expert?: boolean }) {
  if (photo)
    return (
      <span className="relative size-9 shrink-0 overflow-hidden rounded-full bg-soft">
        <ExpertImage src={photo} size={36} className="absolute inset-0 size-full object-cover object-[50%_20%]" />
      </span>
    );
  return (
    <span className={cn("grid size-9 shrink-0 place-items-center rounded-full text-[12px] font-bold", expert ? "bg-soft text-ink-2" : "bg-tint text-brand-ink")}>
      {initials(name)}
    </span>
  );
}

/** One department: who leads it, its people, the experts placed there on their own, and how to add someone. */
export function DepartmentCard({
  org,
  unit,
  parent,
  onEdit,
  onDelete,
}: {
  org: Org;
  unit: OrgUnit;
  parent: string | null;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { chart, editable } = org;
  const { experts: mine } = useExpertsContext();
  const photoOf = (key: string) => mine.find((e) => e.catalogueKey === key)?.photoUrl ?? null;
  const here: Row[] = chart.members.flatMap((member) => member.units.filter((p) => p.unit === unit.id).map((place) => ({ member, place })));
  const headFirst = (a: Row, b: Row) => (a.place.role === b.place.role ? 0 : a.place.role === "head" ? -1 : 1);
  const people = here.filter((r) => r.place.profile == null).sort(headFirst);
  const experts = here.filter((r) => r.place.profile != null).sort(headFirst);
  const expertOf = (r: Row) => r.member.experts.find((x) => x.profile === r.place.profile);
  const expertLabel = (r: Row) => expertOf(r)?.label ?? r.place.profile ?? "";
  const remove = (r: Row) => void org.change(`/api/org/assignments/${r.place.id}`, "DELETE", undefined, "Retiré du département.");
  // A photo, a name and the role in the department under it; changing it or removing is in the row's « … ».
  const row = (r: Row, name: string, photo: string | null, expert: boolean, drag: DragItem) => (
    <li
      key={r.place.id}
      draggable={editable}
      onDragStart={(e) => org.dragStart(e, drag)}
      className={cn("group flex min-h-12 items-center gap-2.5 rounded-xl px-2 py-1.5", editable && "cursor-grab hover:bg-soft")}
    >
      <Face name={name} photo={photo} expert={expert} />
      <span className="min-w-0 grow leading-tight">
        <span className="block truncate text-[14px] font-semibold text-ink">{name}</span>
        <span className={cn("block truncate text-[12px]", r.place.role === "head" ? "font-semibold text-brand-ink" : "text-ink-3")}>
          {expert ? (r.place.role === "head" ? "Expert, responsable" : "Expert") : ROLE_LABEL[r.place.role]}
        </span>
      </span>
      {editable && <RowMenu role={r.place.role} label={name} onRole={(role) => void org.setRole(r.place.id, role)} onRemove={() => remove(r)} />}
    </li>
  );

  return (
    <section
      aria-label={`Département ${unit.name}`}
      onDragOver={(e) => org.dragOver(e, unit.id)}
      onDragLeave={() => org.dragLeave(unit.id)}
      onDrop={(e) => org.drop(e, unit.id)}
      className={cn(CARD, "flex h-full min-w-0 flex-col p-4 transition-shadow sm:p-5", org.target === unit.id && "border-brand ring-2 ring-brand/25")}
    >
      <header className="flex items-start gap-2">
        <div className="min-w-0 grow">
          {parent && (
            <p className="mb-1 inline-flex max-w-full items-center gap-1 rounded-full bg-soft px-2 py-0.5 text-[12px] font-semibold text-ink-2">
              <CornerDownRight className="size-3 shrink-0" /> <span className="truncate">{parent}</span>
            </p>
          )}
          <h2 className="font-display text-[19px] font-bold leading-snug text-ink [overflow-wrap:anywhere]">{unit.name}</h2>
        </div>
        {editable && (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label={`Actions pour ${unit.name}`} className="grid size-9 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-soft hover:text-ink">
                <MoreHorizontal className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={onEdit}>
                <Pencil /> Renommer ou déplacer
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                <Trash2 /> Supprimer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      {people.length + experts.length === 0 ? (
        <p className="mt-3 rounded-xl bg-soft px-3 py-2.5 text-[13px] text-ink-3">Personne pour l’instant.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-0.5">
          {people.map((r) => row(r, memberName(r.member), null, false, { kind: "member", member: r.member.id, from: { id: r.place.id, unit: unit.id } }))}
          {experts.map((r) =>
            row(r, expertLabel(r), photoOf(expertOf(r)?.key ?? ""), true, {
              kind: "expert",
              member: r.member.id,
              profile: r.place.profile ?? "",
              from: { id: r.place.id, unit: unit.id },
            })
          )}
        </ul>
      )}

      {editable && (
        <div className="mt-auto pt-3">
          <AddMenu org={org} unit={unit} people={people} experts={experts} />
        </div>
      )}
    </section>
  );
}

function AddMenu({ org, unit, people, experts }: { org: Org; unit: OrgUnit; people: Row[]; experts: Row[] }) {
  const { chart } = org;
  const freeMembers = chart.members.filter((m) => !people.some((r) => r.member.id === m.id));
  const freeExperts = chart.members.flatMap((m) => m.experts.filter((x) => !experts.some((r) => r.member.id === m.id && r.place.profile === x.profile)).map((x) => ({ m, x })));
  if (!freeMembers.length && !freeExperts.length) return null;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Ajouter à ${unit.name}`}
          className="flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line text-[13px] font-semibold text-ink-2 hover:border-brand/40 hover:bg-soft hover:text-ink"
        >
          <Plus className="size-4" /> Ajouter une personne ou un Expert
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-72 overflow-y-auto">
        {freeMembers.length > 0 && (
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-ink-3">Une personne et ses Experts</DropdownMenuLabel>
            {freeMembers.map((m) => (
              <DropdownMenuItem key={m.id} onSelect={() => void org.assign(unit.id, m.id, null)}>
                <span className="grid size-6 place-items-center rounded-full bg-tint text-[10px] font-bold text-brand-ink">{initials(memberName(m))}</span>
                {memberName(m)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        )}
        {freeMembers.length > 0 && freeExperts.length > 0 && <DropdownMenuSeparator />}
        {freeExperts.length > 0 && (
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-ink-3">Un Expert seul</DropdownMenuLabel>
            {freeExperts.map(({ m, x }) => (
              <DropdownMenuItem key={`${m.id}|${x.profile}`} onSelect={() => void org.assign(unit.id, m.id, x.profile)}>
                <Sparkles className="size-4 text-brand" />
                <span className="min-w-0 truncate">
                  {x.label} <span className="text-ink-3">· {memberName(m).split(" ")[0]}</span>
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The members in no department: they read only what is left for the whole company. */
export function UnplacedCard({ org, documents }: { org: Org; documents: number }) {
  const { chart, editable } = org;
  const unplaced = chart.members.filter((m) => !m.units.some((p) => p.profile == null));
  return (
    <section aria-label="Sans département" className="mt-4 rounded-[22px] border border-dashed border-line bg-soft/60 p-4 sm:p-5">
      <h2 className="font-display text-lg font-bold text-ink">Sans département</h2>
      <p className="text-[13px] text-ink-3">
        {unplaced.length ? `${count(unplaced.length, "membre")}. Ils lisent seulement ce qui est pour toute l’entreprise` : "Tout le monde a un département"}
        {documents ? ` (${count(documents, "document")}).` : "."}
      </p>
      {unplaced.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {unplaced.map((m) => {
            const name = memberName(m);
            return (
              <li key={m.id} className="flex items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-1.5">
                <span
                  draggable={editable}
                  onDragStart={(e) => org.dragStart(e, { kind: "member", member: m.id })}
                  className={cn("flex items-center gap-2", editable && "cursor-grab")}
                >
                  <span className="grid size-7 place-items-center rounded-full bg-tint text-[12px] font-bold text-brand-ink">{initials(name)}</span>
                  <span className="text-sm font-semibold text-ink">{name}</span>
                </span>
                {editable && chart.units.length > 0 && (
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <button type="button" aria-label={`Département de ${name}`} className="inline-flex h-8 items-center gap-1 rounded-full bg-soft px-2.5 text-[12.5px] font-semibold text-ink-2 hover:bg-soft-2">
                        Placer dans <ChevronDown className="size-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                      {chart.units.map((u) => (
                        <DropdownMenuItem key={u.id} onSelect={() => void org.assign(u.id, m.id, null)}>
                          {u.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
