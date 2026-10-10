// The company memory and the org chart that walls it, as the back office hands them over
// (`/api/v1/app/memory/*`, `/api/v1/app/org/*`). Shared by the server and the screens.

export type MemoryStatus = "pending" | "synced" | "skipped" | "error";

export interface MemoryItem {
  id: string;
  title: string;
  kind: "note" | "document" | "website";
  description: string | null;
  note: string | null;
  fileName: string | null;
  /** Null: readable by the whole company. */
  unit: string | null;
  active: boolean;
  status: MemoryStatus;
  /** Why it was not sent, or what the last try said. */
  error: string | null;
  sentAt: string | null;
  canEdit: boolean;
}

export interface MemoryList {
  items: MemoryItem[];
  /** The units whose compartment the member reads. */
  units: { id: string; name: string; canDeposit: boolean }[];
  canDepositForAll: boolean;
}

export interface MemoryNote {
  title: string;
  note: string;
  description?: string;
  unit?: string | null;
}

export type MemoryPatch = Partial<{ title: string; note: string; description: string | null; unit: string | null; active: boolean }>;

export interface OrgUnit {
  id: string;
  name: string;
  parent: string | null;
}

export interface OrgMember {
  id: string;
  name: string | null;
  email: string | null;
  unit: string | null;
  unitRole: "member" | "head";
}

export interface OrgGrant {
  id: string;
  user: string | null;
  granteeUnit: string | null;
  unit: string;
  right: "read" | "write";
}

export interface OrgChart {
  units: OrgUnit[];
  members: OrgMember[];
  grants: OrgGrant[];
}

export type OrgGrantDraft = { unit: string; right: "read" | "write" } & ({ user: string } | { granteeUnit: string });

// A public id goes into the back office's URL: only its plain form is let through.
const PUBLIC_ID = /^[a-z]{2,5}_[A-Za-z0-9]{6,40}$/;
export const isPublicId = (v: unknown): v is string => typeof v === "string" && PUBLIC_ID.test(v);

/** The units in tree order, each with its depth. A unit caught in a loop is listed at the top. */
export function orderUnits(units: OrgUnit[]): { unit: OrgUnit; depth: number }[] {
  const ids = new Set(units.map((u) => u.id));
  const out: { unit: OrgUnit; depth: number }[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    for (const unit of units) {
      const child = parent === null ? unit.parent === null || !ids.has(unit.parent) : unit.parent === parent;
      if (!child || seen.has(unit.id)) continue;
      seen.add(unit.id);
      out.push({ unit, depth });
      walk(unit.id, depth + 1);
    }
  };
  walk(null, 0);
  for (const unit of units) if (!seen.has(unit.id)) out.push({ unit, depth: 0 });
  return out;
}
