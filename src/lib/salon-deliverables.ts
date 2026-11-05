// A salon's deliverables (`/api/buzz/salons/<id>/livrables`) as the thread cites them: only a path under
// Livrables/<Expert>/Salons/<this salon>/ that the list holds becomes a link; nothing is guessed. Pure: tested.
import { BARE, CODE, drivePathsIn, normDrivePath, safeDecode } from "./drive-links.ts";

export interface SalonDeliverable {
  id: string;
  expertId: string;
  title: string;
  kind: string;
  updatedAt: string;
  url: string | null;
  folder: string;
  auteur: string;
  /** The drive path, when the answer names it (a guest's list); else read off the signed address. */
  path?: string;
  /** The back office served its last known answer while it reads again. */
  stale?: boolean;
  checkedAt?: string;
}

/** True when `path` names a file in this salon's folder of some Expert's drive. */
export function inSalon(path: string, salon: string): boolean {
  const parts = normDrivePath(path).split("/");
  return parts.length >= 6 && parts[0] === "~" && parts[1] === "Livrables" && parts[3] === "Salons" && parts[4] === salon && !parts.includes("..");
}

// The drive path a deliverable's signed address names (its `p`).
function pathOf(d: SalonDeliverable): string | null {
  if (d.path) return normDrivePath(d.path);
  if (!d.url) return null;
  try {
    const p = new URL(d.url, "http://x").searchParams.get("p");
    return p ? normDrivePath(p) : null;
  } catch {
    return null;
  }
}

/** The list's entry for `path`, matched on the normalised drive path; null when it holds none. */
export function salonDeliverableFor(path: string, salon: string, items: readonly SalonDeliverable[]): SalonDeliverable | null {
  if (!inSalon(path, salon)) return null;
  const want = normDrivePath(path);
  return items.find((d) => pathOf(d) === want) ?? null;
}

/** The salon paths a message cites, in order, each once. */
export const salonPathsIn = (text: string, salon: string): string[] => drivePathsIn(text).filter((p) => inSalon(p, salon));

/** The list as the device keeps it: never a signed address. */
export const withoutUrls = (items: readonly SalonDeliverable[]): SalonDeliverable[] => items.map((d) => ({ ...d, url: null }));

const md = (label: string) => label.replace(/([_*\[\]])/g, "\\$1");

/**
 * `text` with each cited salon file the list holds as a markdown link to its address; `links` maps each
 * link's text to that address (a click opens it as the Livrables tab does). Every other path stays as written.
 */
export function linkSalonPaths(text: string, salon: string, items: readonly SalonDeliverable[]): { text: string; links: Map<string, string> } {
  const links = new Map<string, string>();
  const link = (path: string): string | null => {
    const d = salonDeliverableFor(path, salon, items);
    if (!d?.url) return null;
    const name = safeDecode(path.split("/").pop() ?? path);
    links.set(name, d.url);
    return `[${md(name)}](${d.url})`;
  };
  const out = text
    .replace(CODE, (m, path: string) => link(path) ?? m)
    .replace(BARE, (m, lead: string, path: string) => {
      const l = link(path);
      return l ? `${lead}${l}` : m;
    });
  return { text: out, links };
}
