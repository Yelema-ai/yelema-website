"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { orderUnits, type OrgUnit } from "@/lib/memory";
import { canMoveUnit } from "@/lib/org-chart";
import { Picker } from "@/components/ui/picker";

export type DepartmentDraft = { name: string; parent: string | null };

const TOP = "";

/** Create a department (RH, Design…), or rename one and choose the department it depends on. */
export function DepartmentDialog({
  open,
  onOpenChange,
  units,
  unit,
  parent: under = null,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  units: OrgUnit[];
  /** Null: a new department. */
  unit: OrgUnit | null;
  /** For a new department: the one it starts under (null: under the company). */
  parent?: string | null;
  onSave: (draft: DepartmentDraft) => Promise<boolean>;
}) {
  const [name, setName] = useState(unit?.name ?? "");
  const [parent, setParent] = useState(unit ? (unit.parent ?? TOP) : (under ?? TOP));
  const [saving, setSaving] = useState(false);
  // A department cannot go under itself or under one of its own.
  const parents = orderUnits(units).filter(({ unit: u }) => !unit || (u.id !== unit.id && canMoveUnit(units, unit.id, u.id)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = name.trim();
    if (!clean || saving) return;
    setSaving(true);
    const ok = await onSave({ name: clean, parent: parent || null });
    setSaving(false);
    if (ok) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle>{unit ? `Modifier ${unit.name}` : "Nouveau département"}</DialogTitle>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dept-name">Nom</Label>
            <Input id="dept-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="RH, Design, Ventes…" required autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Dépend de</Label>
            <Picker
              label="Dépend de"
              placeholder="Aucun, directement sous l’entreprise"
              value={parent}
              onChange={setParent}
              groups={[{ options: [{ value: TOP, label: "Aucun, directement sous l’entreprise" }, ...parents.map(({ unit: u, depth }) => ({ value: u.id, label: `${"\u00a0\u00a0".repeat(depth)}${u.name}` }))] }]}
              className="w-full sm:h-11 sm:text-[15px]"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={!name.trim() || saving}>
              {saving ? "Enregistrement…" : unit ? "Enregistrer" : "Créer"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
