// How a cell of a workbook reads and is drawn, as Excel shows it (Leslie, 03/11: « logos, mise en forme »).
// Pure: column letters, colours with their tint, number formats, sizes in pixels. No import.

/** « C12 » → 2 (columns from 0). */
export const colIndex = (ref: string): number =>
  [...(ref.match(/^[A-Z]+/)?.[0] ?? "A")].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

/** « C12 » → 11 (rows from 0). */
export const rowIndex = (ref: string): number => Number(ref.match(/\d+$/)?.[0] ?? "1") - 1;

/** A column width in characters (Excel's unit) as pixels; 8.43 characters, Excel's default, is 64 px. */
export const colWidthPx = (chars: number | null | undefined): number => Math.round((chars ?? 8.43) * 7 + 5);

/** A row height in points as pixels; 15 points, Excel's default, is 20 px. */
export const rowHeightPx = (points: number | null | undefined): number => Math.round(((points ?? 15) * 4) / 3);

/** Drawing offsets are in EMU: 9525 to a pixel. */
export const emuPx = (emu: number): number => Math.round(emu / 9525);

/** « FFE30613 » or « E30613 » → « #E30613 »; null for anything else. */
export function argbHex(argb: string | null | undefined): string | null {
  const v = (argb ?? "").trim();
  if (/^[0-9a-f]{8}$/i.test(v)) return `#${v.slice(2).toUpperCase()}`;
  if (/^[0-9a-f]{6}$/i.test(v)) return `#${v.toUpperCase()}`;
  return null;
}

/** Excel's tint: towards white when positive, towards black when negative (-1 to 1). */
export function applyTint(hex: string, tint: number): string {
  if (!tint) return hex;
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(tint < 0 ? c * (1 + tint) : c + (255 - c) * tint));
  return `#${ch.map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/** The formats Excel numbers itself (no `numFmt` written in the file). */
export const BUILTIN_FORMATS: Record<number, string> = {
  0: "General",
  1: "0",
  2: "0.00",
  3: "#,##0",
  4: "#,##0.00",
  9: "0%",
  10: "0.00%",
  11: "0.00E+00",
  14: "dd/mm/yyyy",
  15: "d-mmm-yy",
  16: "d-mmm",
  17: "mmm-yy",
  18: "h:mm AM/PM",
  20: "h:mm",
  21: "h:mm:ss",
  22: "dd/mm/yyyy h:mm",
  37: "#,##0 ;(#,##0)",
  38: "#,##0 ;[Red](#,##0)",
  39: "#,##0.00;(#,##0.00)",
  40: "#,##0.00;[Red](#,##0.00)",
  49: "@",
};

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/** A date serial (days since 30/12/1899, as Excel keeps it) as a UTC date. */
export function excelDate(serial: number): Date {
  return new Date(Math.round((serial - 25569) * 86400) * 1000);
}

// The literal text around the number in one section of a format: « "FCFA" », « \ € », « [Red] » dropped.
function literal(part: string): string {
  return part
    .replace(/\[[^\]]*\]/g, "")
    .replace(/"([^"]*)"/g, "$1")
    .replace(/\\(.)/g, "$1")
    .replace(/_./g, " ")
    .replace(/\*./g, "");
}

function isDateFormat(fmt: string): boolean {
  const bare = fmt.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "");
  return /[dmyhs]/i.test(bare) && !/[#0]/.test(bare.replace(/[dmyhs.:\/\-\s,]/gi, ""));
}

function formatDate(d: Date, fmt: string): string {
  const p2 = (n: number) => String(n).padStart(2, "0");
  const day = d.getUTCDate();
  const month = d.getUTCMonth();
  const year = d.getUTCFullYear();
  const hasTime = /h/i.test(fmt);
  const hasDay = /d/i.test(fmt.replace(/"[^"]*"/g, ""));
  const word = /mmm/i.test(fmt);
  let out = hasDay ? (word ? `${day} ${MONTHS[month]} ${year}` : `${p2(day)}/${p2(month + 1)}/${year}`) : `${MONTHS[month]} ${year}`;
  if (!/y/i.test(fmt) && hasDay) out = word ? `${day} ${MONTHS[month]}` : `${p2(day)}/${p2(month + 1)}`;
  if (hasTime) {
    const t = `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}${/s/i.test(fmt.replace(/"[^"]*"/g, "")) ? `:${p2(d.getUTCSeconds())}` : ""}`;
    out = /[dmy]/i.test(fmt.replace(/"[^"]*"/g, "").replace(/mm(?=:)|(?<=:)mm/gi, "")) ? `${out} ${t}` : t;
  }
  return out;
}

/** A number as its format shows it, in French (« 12 600 000 », « 12,5 % », « 1 250 FCFA », « 03/11/2026 »). */
export function formatNumber(value: number, format: string | null | undefined): string {
  const fmt = format && format !== "General" ? format : null;
  if (!fmt || fmt === "@") return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value);
  const sections = fmt.split(/;(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  let section = sections[0]!;
  let v = value;
  if (value < 0 && sections[1] !== undefined) {
    section = sections[1];
    v = Math.abs(value);
  } else if (value === 0 && sections[2] !== undefined) section = sections[2];
  if (isDateFormat(section)) return formatDate(excelDate(v), section);
  const at = section.search(/[#0?]/);
  if (at < 0) return literal(section);
  const end = section.length - [...section].reverse().join("").search(/[#0?%]/);
  const pattern = section.slice(at, end);
  const percent = pattern.includes("%") || /%/.test(section.slice(end).replace(/"[^"]*"/g, ""));
  const decimals = pattern.includes(".") ? (pattern.split(".")[1]!.match(/[0#?]/g) ?? []).length : 0;
  const minDecimals = pattern.includes(".") ? (pattern.split(".")[1]!.match(/0/g) ?? []).length : 0;
  const grouped = /[#0],[#0]/.test(pattern);
  // « #,##0, » divides by 1 000 for each trailing comma.
  const scale = 1000 ** (pattern.replace(/%$/, "").match(/,+$/)?.[0].length ?? 0);
  const n = (percent ? v * 100 : v) / scale;
  const body = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: minDecimals, maximumFractionDigits: decimals, useGrouping: grouped }).format(n);
  return `${literal(section.slice(0, at))}${body}${percent ? " %" : ""}${literal(section.slice(end).replace(/%/g, ""))}`.replace(/\s+$/, "");
}

/** Whether a format draws a number, so that it sits right as in Excel. */
export const isTextFormat = (format: string | null | undefined): boolean => format === "@";
