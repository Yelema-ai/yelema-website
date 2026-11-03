// How a cell of a spreadsheet preview reads: a number aligned right, a total row stands out (Leslie,
// 02/11 : « qu'un budget se lise comme un budget »). Pure.

/** A cell holding a number, an amount or a percentage (« 1 800 000 », « -12,5 % », « 3 150 000 FCFA »). */
export function isNumberCell(value: string): boolean {
  const v = value.trim();
  if (!v || !/\d/.test(v)) return false;
  return /^[-+(]?\s*(?:[$€£]\s*)?\d[\d\s  .,']*\)?\s*(?:%|€|\$|£|F\s?CFA|FCFA|XOF|k|M)?$/i.test(v);
}

/** A row that sums the others: its first filled cell starts with « Total », « Sous-total » or « Totaux ». */
export function isTotalRow(row: readonly string[]): boolean {
  const first = row.find((c) => c.trim())?.trim() ?? "";
  return /^(?:sous[-\s]?)?total(?:aux|e|es)?\b|^totaux\b|^grand total\b/i.test(first);
}
