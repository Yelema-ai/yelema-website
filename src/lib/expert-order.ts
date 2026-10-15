// Djénéba, the Chief of Staff, leads the team everywhere it is listed; the others follow by name.
const LEAD = "djeneba";

const plain = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

type Ordered = { profileId: string; displayName: string; catalogueKey?: string | null };

const leads = (e: Ordered, defaultKey: string | null): boolean =>
  (defaultKey != null && e.catalogueKey === defaultKey) || plain(e.displayName) === LEAD || plain(e.profileId).split("__").pop() === LEAD;

export function orderExperts<T extends Ordered>(experts: T[], defaultKey: string | null): T[] {
  return [...experts].sort((a, b) => Number(leads(b, defaultKey)) - Number(leads(a, defaultKey)) || a.displayName.localeCompare(b.displayName, "fr"));
}
