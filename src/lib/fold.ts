/** Text folded for a search: no accents, lower case. */
export const fold = (t: string): string => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
