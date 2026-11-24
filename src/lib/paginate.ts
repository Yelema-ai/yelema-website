// One page of a list, its page clamped into range (a list that shrinks never leaves an empty page).
// No imports, for `node --test`.

export interface Page<T> {
  items: T[];
  page: number;
  pages: number;
  from: number;
  to: number;
}

export function paginate<T>(list: T[], page: number, size: number): Page<T> {
  const per = Math.max(1, Math.floor(size));
  const pages = Math.max(1, Math.ceil(list.length / per));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const start = (current - 1) * per;
  const items = list.slice(start, start + per);
  return { items, page: current, pages, from: items.length ? start + 1 : 0, to: start + items.length };
}

/**
 * The first `limit` rows across `groups`, in order; each kept group carries its real size (`total`), and `hidden`
 * counts the rows left out. A long list is drawn a slice at a time, « Afficher plus » adding the next.
 */
export function capGroups<R, G extends { rows: R[] }>(groups: G[], limit: number): { groups: (G & { total: number })[]; hidden: number } {
  const out: (G & { total: number })[] = [];
  let room = Math.max(0, Math.floor(limit));
  let hidden = 0;
  for (const g of groups) {
    const rows = g.rows.slice(0, room);
    room -= rows.length;
    hidden += g.rows.length - rows.length;
    if (rows.length) out.push({ ...g, rows, total: g.rows.length });
  }
  return { groups: out, hidden };
}
