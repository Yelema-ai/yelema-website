"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type JSZip from "jszip";
import { cn } from "@/lib/utils";
import { isNumberCell, isTotalRow } from "@/lib/sheet-cells";
import {
  BUILTIN_FORMATS,
  applyTint,
  argbHex,
  colIndex,
  colWidthPx,
  emuPx,
  formatNumber,
  rowHeightPx,
  rowIndex,
} from "@/lib/xlsx-format";

// A workbook drawn as Excel shows it (Leslie, 03/11: « logos, mise en forme »): its colours, fonts, borders,
// merged cells, column widths, row heights, number formats, its pictures where they sit, and every visible
// sheet in tabs at the bottom. Read in the page from the file's own parts (a zip of XML), with jszip.

const MAX_XML_PART_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

type Book = { zip: JSZip; sheets: { name: string; path: string }[]; styles: Style[]; shared: string[] };
type Style = { css: CSSProperties; format: string | null; align: string | null };
type Cell = { text: string; css: CSSProperties; number: boolean; colSpan: number; rowSpan: number; spill: number } | null;
type Sheet = { cols: number[]; rows: { height: number; cells: (Cell | "covered")[] }[]; images: { src: string; x: number; y: number; w: number; h: number }[]; grid: boolean; cut: boolean };

// By local name: the same part is written « xdr:from » by Excel and « from » by other tools.
const local = (tag: string) => tag.slice(tag.indexOf(":") + 1);
const el = (node: Element | Document | null | undefined, tag: string) => [...(node?.getElementsByTagNameNS("*", local(tag)) ?? [])];
const first = (node: Element | Document | null | undefined, tag: string) => node?.getElementsByTagNameNS("*", local(tag))[0] ?? null;
const num = (v: string | null | undefined) => (v == null || v === "" || isNaN(Number(v)) ? null : Number(v));

async function xml(zip: JSZip, path: string): Promise<Document | null> {
  const part = zip.file(path);
  if (!part) return null;
  // jszip's private `_data` holds the part's inflated size, read from the zip before inflating it.
  if (((part as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0) > MAX_XML_PART_BYTES) throw new Error("too large");
  return new DOMParser().parseFromString(await part.async("string"), "application/xml");
}

// « worksheets/sheet1.xml » next to « xl/workbook.xml » → « xl/worksheets/sheet1.xml »; « ../media/a.png » too.
function resolve(base: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = base.split("/").slice(0, -1);
  for (const p of target.split("/")) {
    if (p === "..") parts.pop();
    else if (p !== ".") parts.push(p);
  }
  return parts.join("/");
}

const relsOf = (path: string) => path.replace(/([^/]+)$/, "_rels/$1.rels");

async function rels(zip: JSZip, path: string): Promise<Map<string, string>> {
  const doc = await xml(zip, relsOf(path));
  return new Map(el(doc, "Relationship").map((r) => [r.getAttribute("Id") ?? "", resolve(path, r.getAttribute("Target") ?? "")]));
}

function themeColors(theme: Document | null): string[] {
  const scheme = first(theme, "a:clrScheme");
  const pick = (tag: string) => {
    const node = first(scheme, tag);
    return argbHex(first(node, "a:srgbClr")?.getAttribute("val") ?? first(node, "a:sysClr")?.getAttribute("lastClr")) ?? "#000000";
  };
  // Excel's theme index: light 1, dark 1, light 2, dark 2, then the six accents.
  return ["a:lt1", "a:dk1", "a:lt2", "a:dk2", "a:accent1", "a:accent2", "a:accent3", "a:accent4", "a:accent5", "a:accent6"].map(pick);
}

function color(node: Element | null, theme: string[]): string | null {
  if (!node) return null;
  const tint = num(node.getAttribute("tint")) ?? 0;
  const rgb = argbHex(node.getAttribute("rgb"));
  if (rgb) return applyTint(rgb, tint);
  const t = num(node.getAttribute("theme"));
  if (t != null && theme[t]) return applyTint(theme[t]!, tint);
  return null;
}

const BORDER: Record<string, string> = { thin: "1px solid", hair: "1px solid", dotted: "1px dotted", dashed: "1px dashed", medium: "2px solid", mediumDashed: "2px dashed", thick: "3px solid", double: "3px double" };

async function readStyles(zip: JSZip): Promise<Style[]> {
  const [doc, theme] = await Promise.all([xml(zip, "xl/styles.xml"), xml(zip, "xl/theme/theme1.xml")]);
  const colors = themeColors(theme);
  const formats = new Map(el(doc, "numFmt").map((f) => [Number(f.getAttribute("numFmtId")), f.getAttribute("formatCode") ?? ""]));
  const fonts = el(first(doc, "fonts"), "font").map((f): CSSProperties => {
    const size = num(first(f, "sz")?.getAttribute("val"));
    const c = color(first(f, "color"), colors);
    const b = first(f, "b");
    const i = first(f, "i");
    const u = first(f, "u");
    return {
      ...(size ? { fontSize: `${Math.round((size * 4) / 3)}px` } : {}),
      ...(c && c !== "#000000" ? { color: c } : {}),
      ...(b && b.getAttribute("val") !== "0" ? { fontWeight: 700 } : {}),
      ...(i && i.getAttribute("val") !== "0" ? { fontStyle: "italic" } : {}),
      ...(u && u.getAttribute("val") !== "none" ? { textDecoration: "underline" } : {}),
    };
  });
  const fills = el(first(doc, "fills"), "fill").map((f): CSSProperties => {
    const p = first(f, "patternFill");
    if (!p || p.getAttribute("patternType") === "none" || !p.getAttribute("patternType")) return {};
    const c = color(first(p, "fgColor"), colors) ?? color(first(p, "bgColor"), colors);
    return c ? { background: c } : {};
  });
  const borders = el(first(doc, "borders"), "border").map((b): CSSProperties => {
    const side = (tag: string) => {
      const s = first(b, tag);
      const style = s?.getAttribute("style");
      return style && BORDER[style] ? `${BORDER[style]} ${color(first(s, "color"), colors) ?? "#1d1a2b"}` : undefined;
    };
    const out: CSSProperties = {};
    const [t, r, bt, l] = [side("top"), side("right"), side("bottom"), side("left")];
    if (t) out.borderTop = t;
    if (r) out.borderRight = r;
    if (bt) out.borderBottom = bt;
    if (l) out.borderLeft = l;
    return out;
  });
  return el(first(doc, "cellXfs"), "xf").map((x) => {
    const a = first(x, "alignment");
    const h = a?.getAttribute("horizontal") ?? null;
    const v = a?.getAttribute("vertical");
    const id = Number(x.getAttribute("numFmtId") ?? 0);
    return {
      css: {
        ...fonts[Number(x.getAttribute("fontId") ?? 0)],
        ...fills[Number(x.getAttribute("fillId") ?? 0)],
        ...borders[Number(x.getAttribute("borderId") ?? 0)],
        ...(h && h !== "general" ? { textAlign: (h === "centerContinuous" ? "center" : h === "fill" || h === "distributed" ? "left" : h) as CSSProperties["textAlign"] } : {}),
        verticalAlign: v === "top" ? "top" : v === "center" ? "middle" : "bottom",
        ...(a?.getAttribute("wrapText") === "1" ? { whiteSpace: "normal" } : {}),
      },
      format: formats.get(id) ?? BUILTIN_FORMATS[id] ?? null,
      align: h,
    };
  });
}

export async function openBook(data: ArrayBuffer): Promise<Book> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(data);
  const book = await xml(zip, "xl/workbook.xml");
  const links = await rels(zip, "xl/workbook.xml");
  const sheets = el(book, "sheet")
    .filter((s) => !s.getAttribute("state") || s.getAttribute("state") === "visible")
    .map((s) => ({ name: s.getAttribute("name") ?? "Feuille", path: links.get(s.getAttribute("r:id") ?? s.getAttributeNS(NS_R, "id") ?? "") ?? "" }))
    .filter((s) => s.path);
  const [styles, strings] = await Promise.all([readStyles(zip), xml(zip, "xl/sharedStrings.xml")]);
  // A rich text keeps its runs' text, in order.
  const shared = el(strings, "si").map((si) => el(si, "t").map((t) => t.textContent ?? "").join(""));
  return { zip, sheets, styles, shared };
}

async function images(zip: JSZip, sheetPath: string, doc: Document | null, x: (col: number, off: number) => number, y: (row: number, off: number) => number) {
  const out: Sheet["images"] = [];
  const drawing = first(doc, "drawing");
  const rid = drawing?.getAttribute("r:id") ?? drawing?.getAttributeNS(NS_R, "id");
  if (!rid) return out;
  const drawingPath = (await rels(zip, sheetPath)).get(rid);
  if (!drawingPath) return out;
  const [dr, media] = await Promise.all([xml(zip, drawingPath), rels(zip, drawingPath)]);
  const anchors = [...el(dr, "xdr:twoCellAnchor"), ...el(dr, "xdr:oneCellAnchor")];
  for (const anchor of anchors.slice(0, 20)) {
    const blip = first(anchor, "a:blip");
    const embed = blip?.getAttribute("r:embed") ?? blip?.getAttributeNS(NS_R, "embed");
    const file = embed ? zip.file(media.get(embed) ?? "") : null;
    const from = first(anchor, "xdr:from");
    if (!file || !from) continue;
    if (((file as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0) > MAX_IMAGE_BYTES) continue;
    const at = (node: Element | null) => ({
      col: Number(first(node, "xdr:col")?.textContent ?? 0),
      colOff: Number(first(node, "xdr:colOff")?.textContent ?? 0),
      row: Number(first(node, "xdr:row")?.textContent ?? 0),
      rowOff: Number(first(node, "xdr:rowOff")?.textContent ?? 0),
    });
    const f = at(from);
    const x0 = x(f.col, f.colOff);
    const y0 = y(f.row, f.rowOff);
    const to = first(anchor, "xdr:to");
    const ext = first(anchor, "xdr:ext");
    let w = 0;
    let h = 0;
    if (to) {
      const t = at(to);
      w = x(t.col, t.colOff) - x0;
      h = y(t.row, t.rowOff) - y0;
    } else if (ext) {
      w = emuPx(Number(ext.getAttribute("cx") ?? 0));
      h = emuPx(Number(ext.getAttribute("cy") ?? 0));
    }
    if (w <= 0 || h <= 0) continue;
    const name = (media.get(embed!) ?? "").toLowerCase();
    const type = name.endsWith(".png") ? "image/png" : name.endsWith(".gif") ? "image/gif" : name.endsWith(".svg") ? "image/svg+xml" : "image/jpeg";
    // A picture of the file, never its script: an <img> of a blob.
    const src = URL.createObjectURL(new Blob([await file.async("arraybuffer")], { type }));
    out.push({ src, x: x0, y: y0, w, h });
  }
  return out;
}

export async function readSheet(book: Book, index: number, maxRows: number, maxCols: number): Promise<Sheet> {
  const { zip, styles, shared } = book;
  const path = book.sheets[index]?.path;
  const doc = path ? await xml(zip, path) : null;
  if (!doc) throw new Error("no sheet");
  const grid = first(doc, "sheetView")?.getAttribute("showGridLines") !== "0";
  const defaultHeight = num(first(doc, "sheetFormatPr")?.getAttribute("defaultRowHeight"));
  const defaultWidth = num(first(doc, "sheetFormatPr")?.getAttribute("defaultColWidth"));
  const widths = new Map<number, number>();
  for (const c of el(doc, "col")) {
    const min = Number(c.getAttribute("min") ?? 1) - 1;
    const max = Math.min(Number(c.getAttribute("max") ?? 1) - 1, maxCols);
    const hidden = c.getAttribute("hidden") === "1";
    for (let i = min; i <= max; i++) widths.set(i, hidden ? 0 : colWidthPx(num(c.getAttribute("width"))));
  }
  // The cells, by row.
  const raw = new Map<number, { height: number | null; hidden: boolean; cells: Map<number, Element> }>();
  let lastRow = -1;
  let lastCol = -1;
  for (const r of el(doc, "row")) {
    const ri = Number(r.getAttribute("r") ?? 0) - 1;
    if (ri < 0 || ri >= maxRows) continue;
    const cells = new Map<number, Element>();
    for (const c of el(r, "c")) {
      const ci = colIndex(c.getAttribute("r") ?? "");
      if (ci < 0 || ci >= maxCols) continue;
      cells.set(ci, c);
      const filled = first(c, "v") || first(c, "f") || first(c, "is") || (c.getAttribute("s") && styles[Number(c.getAttribute("s"))]?.css.background);
      if (filled) {
        lastRow = Math.max(lastRow, ri);
        lastCol = Math.max(lastCol, ci);
      }
    }
    raw.set(ri, { height: num(r.getAttribute("ht")), hidden: r.getAttribute("hidden") === "1", cells });
  }
  const merges = el(doc, "mergeCell")
    .map((m) => (m.getAttribute("ref") ?? "").split(":"))
    .filter((p) => p.length === 2)
    .map(([a, b]) => ({ r0: rowIndex(a!), c0: colIndex(a!), r1: rowIndex(b!), c1: colIndex(b!) }))
    .filter((m) => m.r0 < maxRows && m.c0 < maxCols);
  for (const m of merges) {
    lastRow = Math.max(lastRow, Math.min(m.r1, maxRows - 1));
    lastCol = Math.max(lastCol, Math.min(m.c1, maxCols - 1));
  }
  const cols = Array.from({ length: lastCol + 1 }, (_, i) => widths.get(i) ?? colWidthPx(defaultWidth ?? undefined));
  const heights = Array.from({ length: lastRow + 1 }, (_, i) => (raw.get(i)?.hidden ? 0 : rowHeightPx(raw.get(i)?.height ?? defaultHeight ?? undefined)));
  const x = (col: number, off: number) => cols.slice(0, col).reduce((a, b) => a + b, 0) + emuPx(off);
  const y = (row: number, off: number) => heights.slice(0, row).reduce((a, b) => a + b, 0) + emuPx(off);
  const pics = await images(zip, path!, doc, x, y);
  // A picture past the last cell still shows.
  for (const p of pics) {
    while (cols.reduce((a, b) => a + b, 0) < p.x + p.w && cols.length < maxCols) cols.push(colWidthPx(defaultWidth ?? undefined));
    while (heights.reduce((a, b) => a + b, 0) < p.y + p.h && heights.length < maxRows) heights.push(rowHeightPx(defaultHeight ?? undefined));
  }
  const covered = new Set<string>();
  const spanAt = new Map<string, { rowSpan: number; colSpan: number }>();
  for (const m of merges) {
    spanAt.set(`${m.r0}:${m.c0}`, { rowSpan: Math.min(m.r1, heights.length - 1) - m.r0 + 1, colSpan: Math.min(m.c1, cols.length - 1) - m.c0 + 1 });
    for (let r = m.r0; r <= m.r1; r++) for (let c = m.c0; c <= m.c1; c++) if (r !== m.r0 || c !== m.c0) covered.add(`${r}:${c}`);
  }
  // A formula saved without its result (a file written by a script, not by Excel): the simple ones are
  // worked out here (SUM, AVERAGE, MIN, MAX, COUNT over cells of this sheet); any other stays empty.
  const valueAt = (r: number, c: number): number | null => {
    const cell = raw.get(r)?.cells.get(c);
    const t = cell?.getAttribute("t");
    return cell && (!t || t === "n") ? num(first(cell, "v")?.textContent) : null;
  };
  const compute = (formula: string): number | null => {
    const m = /^\s*(SUM|AVERAGE|MIN|MAX|COUNT)\(([A-Z$0-9:,\s]+)\)\s*$/i.exec(formula);
    if (!m) return null;
    const vals: number[] = [];
    for (const part of m[2]!.replace(/\$/g, "").split(",")) {
      const [a, b = a] = part.trim().split(":");
      if (!/^[A-Z]+\d+$/i.test(a!) || !/^[A-Z]+\d+$/i.test(b!)) return null;
      for (let r = rowIndex(a!); r <= rowIndex(b!); r++) for (let c = colIndex(a!.toUpperCase()); c <= colIndex(b!.toUpperCase()); c++) {
        const v = valueAt(r, c);
        if (v != null) vals.push(v);
      }
    }
    const fn = m[1]!.toUpperCase();
    if (fn === "COUNT") return vals.length;
    if (!vals.length) return fn === "SUM" ? 0 : null;
    if (fn === "SUM") return vals.reduce((x, y) => x + y, 0);
    if (fn === "AVERAGE") return vals.reduce((x, y) => x + y, 0) / vals.length;
    return fn === "MIN" ? Math.min(...vals) : Math.max(...vals);
  };
  const text = (c: Element, style: Style | undefined): { text: string; number: boolean } => {
    const type = c.getAttribute("t");
    const saved = first(c, "v")?.textContent ?? "";
    const formula = first(c, "f")?.textContent;
    const worked = !saved && formula ? compute(formula) : null;
    const v = worked != null ? String(worked) : saved;
    if (type === "s") return { text: shared[Number(v)] ?? "", number: false };
    if (type === "inlineStr") return { text: el(first(c, "is"), "t").map((t) => t.textContent ?? "").join(""), number: false };
    if (type === "b") return { text: v === "1" ? "VRAI" : "FAUX", number: false };
    if (type === "str" || type === "e" || v === "" || isNaN(Number(v))) return { text: v, number: false };
    return { text: formatNumber(Number(v), style?.format), number: true };
  };
  const rows = heights.map((height, ri) => {
    const line = raw.get(ri);
    const cells: (Cell | "covered")[] = cols.map((_, ci) => {
      if (covered.has(`${ri}:${ci}`)) return "covered";
      const c = line?.cells.get(ci);
      const span = spanAt.get(`${ri}:${ci}`) ?? { rowSpan: 1, colSpan: 1 };
      if (!c) return span.rowSpan > 1 || span.colSpan > 1 ? { text: "", css: {}, number: false, ...span, spill: 0 } : null;
      const style = styles[Number(c.getAttribute("s") ?? 0)];
      const t = text(c, style);
      return { ...t, css: style?.css ?? {}, ...span, spill: 0 };
    });
    return { height, cells };
  });
  // A column the file gives no width to is as wide as what it holds: a script that wrote the file left
  // Excel's 64 px, where « 20 100 000 » does not fit.
  for (let ci = 0; ci < cols.length; ci++) {
    if (widths.has(ci)) continue;
    let chars = 0;
    for (const row of rows) {
      const cell = row.cells[ci];
      if (cell && cell !== "covered" && cell.colSpan === 1 && (cell.number || row.cells[ci + 1] !== null)) chars = Math.max(chars, cell.text.length);
    }
    cols[ci] = Math.min(320, Math.max(cols[ci]!, Math.ceil(chars * 7.5 + 12)));
  }
  rows.forEach(({ cells }) => {
    // A text longer than its cell runs over the empty cells to its right, as in Excel.
    cells.forEach((cell, ci) => {
      if (!cell || cell === "covered" || cell.number || !cell.text || cell.colSpan > 1 || cell.css.textAlign === "center" || cell.css.textAlign === "right") return;
      let w = cols[ci]!;
      for (let j = ci + 1; j < cols.length && cells[j] === null; j++) w += cols[j]!;
      cell.spill = w;
    });
  });
  const totalRows = el(doc, "row").length;
  return { cols, rows, images: pics, grid, cut: totalRows > rows.length && lastRow >= maxRows - 1 };
}

function SheetTable({ sheet }: { sheet: Sheet }) {
  const width = sheet.cols.reduce((a, b) => a + b, 0);
  const plain = (cells: (Cell | "covered")[]) => cells.map((c) => (c && c !== "covered" ? c.text : ""));
  return (
    <span className="relative block" style={{ width }}>
      <table className="border-collapse" style={{ tableLayout: "fixed", width, fontFamily: "Calibri, Carlito, Arial, sans-serif", fontSize: "14.5px", color: "#1e1e28" }}>
        <colgroup>
          {sheet.cols.map((w, i) => (
            <col key={i} style={{ width: w }} />
          ))}
        </colgroup>
        <tbody>
          {sheet.rows.map((row, ri) => {
            const total = ri > 0 && isTotalRow(plain(row.cells));
            return (
              <tr key={ri} style={{ height: row.height }}>
                {row.cells.map((cell, ci) => {
                  if (cell === "covered") return null;
                  const grid = sheet.grid ? "1px solid #ececf1" : undefined;
                  const base: CSSProperties = { borderTop: grid, borderRight: grid, borderBottom: grid, borderLeft: grid, padding: "0 4px", whiteSpace: "nowrap", overflow: "hidden", verticalAlign: "bottom", lineHeight: 1.2 };
                  if (!cell) return <td key={ci} style={base} />;
                  const right = cell.css.textAlign ? undefined : cell.number || isNumberCell(cell.text) ? "right" : undefined;
                  return (
                    <td
                      key={ci}
                      colSpan={cell.colSpan > 1 ? cell.colSpan : undefined}
                      rowSpan={cell.rowSpan > 1 ? cell.rowSpan : undefined}
                      style={{ ...base, ...(right ? { textAlign: right } : {}), ...(total && !cell.css.fontWeight ? { fontWeight: 700 } : {}), ...cell.css, ...(cell.spill ? { overflow: "visible" } : {}) }}
                      className={cn(cell.number && "tabular-nums")}
                    >
                      {cell.spill ? <span className="block overflow-hidden" style={{ width: cell.spill - 8 }}>{cell.text}</span> : cell.text}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {sheet.images.map((img, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={i} src={img.src} alt="" className="pointer-events-none absolute object-contain" style={{ left: img.x, top: img.y, width: img.w, height: img.h }} />
      ))}
    </span>
  );
}

/** The workbook: one sheet at a time, its tabs at the bottom (all of them when opened in full). */
export function Workbook({ book, first: initial, full, maxRows, maxCols }: { book: Book; first: Sheet; full: boolean; maxRows: number; maxCols: number }) {
  const [at, setAt] = useState(0);
  const [sheet, setSheet] = useState<Sheet>(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => () => sheet.images.forEach((i) => URL.revokeObjectURL(i.src)), [sheet]);
  const open = (i: number) => {
    if (i === at || busy) return;
    setBusy(true);
    readSheet(book, i, maxRows, maxCols)
      .then((s) => {
        setSheet(s);
        setAt(i);
      })
      .catch(() => undefined)
      .finally(() => setBusy(false));
  };
  return (
    <span className="flex size-full flex-col bg-white text-[#1e1e28]">
      <span className={cn("min-h-0 flex-1", full ? "overflow-auto p-3" : "overflow-hidden p-1.5")}>
        {!sheet.rows.length && <span className="block p-4 text-[13px] text-ink-3">Cet onglet est vide.</span>}
        {/* Excel's 100 % is wide for a side panel: drawn at 85 %, as one would zoom out in Excel. */}
        <span className="block" style={{ zoom: full ? 0.85 : 0.75 }}>
          <SheetTable sheet={sheet} />
        </span>
        {full && sheet.cut && <span className="mt-2 block text-[12px] text-ink-3">Les premières lignes seulement. Téléchargez le fichier pour tout voir.</span>}
      </span>
      {(full ? book.sheets : book.sheets.slice(0, 1)).length > 0 && (
        <span role={full ? "tablist" : undefined} className="flex shrink-0 gap-1 overflow-x-auto border-t border-[#e3e3ea] bg-[#f6f6f9] px-2 pt-1">
          {(full ? book.sheets : book.sheets.slice(at, at + 1)).map((s, i) =>
            full ? (
              <button
                key={s.path}
                type="button"
                role="tab"
                aria-selected={i === at}
                onClick={() => open(i)}
                className={cn(
                  "min-h-9 shrink-0 whitespace-nowrap rounded-t-lg px-3 text-[12.5px] font-semibold",
                  i === at ? "bg-white text-[#137A4B] shadow-[inset_0_-2px_0_#137A4B]" : "text-[#5d5a6b] hover:bg-white/60"
                )}
              >
                {s.name}
              </button>
            ) : (
              <span key={s.path} className="px-2 py-1.5 text-[12px] font-semibold text-[#137A4B]">
                {s.name}
                {book.sheets.length > 1 && <span className="font-normal text-[#5d5a6b]"> et {book.sheets.length - 1} autre{book.sheets.length > 2 ? "s" : ""}</span>}
              </span>
            )
          )}
        </span>
      )}
    </span>
  );
}
