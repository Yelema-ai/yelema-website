"use client";

import { Building2, User } from "lucide-react";
import type { SettingScope } from "@/lib/llm";
import { cn } from "@/lib/utils";
import { Picker } from "@/components/ui/picker";

export interface ScopeMember {
  id: string;
  name: string | null;
  email: string;
}

const memberLabel = (m: ScopeMember) => (m.name ? `${m.name} (${m.email})` : m.email);

// Pour qui l'administrateur règle : toute l'entreprise, ou un membre. Partagé par Modèles et MCP.
// Un réglage posé pour un membre passe avant celui de l'entreprise, sur son instance seulement.
export function ScopePicker({ members, value, onChange }: { members: ScopeMember[]; value: SettingScope; onChange: (scope: SettingScope) => void }) {
  const forMember = value.kind === "member";
  const first = members[0];
  const tab = "flex items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all";

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div role="tablist" aria-label="Portée du réglage" className="grid shrink-0 grid-cols-2 rounded-xl border border-line bg-soft p-1">
        <button type="button" role="tab" aria-selected={!forMember} onClick={() => onChange({ kind: "client" })} className={cn(tab, !forMember ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink")}>
          <Building2 className="h-3.5 w-3.5" />
          Toute l’entreprise
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={forMember}
          disabled={!first}
          onClick={() => first && !forMember && onChange({ kind: "member", id: first.id })}
          className={cn(tab, forMember ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink", !first && "cursor-not-allowed opacity-50")}
        >
          <User className="h-3.5 w-3.5" />
          Un membre
        </button>
      </div>
      {forMember && (
        <Picker
          label="Membre"
          placeholder="Choisir un membre"
          value={value.id}
          onChange={(id) => onChange({ kind: "member", id })}
          groups={[{ options: members.map((m) => ({ value: m.id, label: memberLabel(m) })) }]}
          className="h-10 flex-1 sm:h-10 sm:max-w-sm sm:text-sm"
        />
      )}
    </div>
  );
}
