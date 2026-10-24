"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Download, File, FileImage, FileSpreadsheet, FileText, Presentation, type LucideIcon } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { isMemoryFolder } from "@/lib/drive-order";
import type { DocKind, DriveFile, TurnDoc } from "@/lib/drive-links";
import type { FileListResponse } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FilePreview } from "@/components/files/FilePreview";
import { contentUrl, formatBytes, type FileEntry } from "@/components/files/types";

const KINDS: Record<DocKind, { label: string; icon: LucideIcon; tone: string }> = {
  pdf: { label: "PDF", icon: FileText, tone: "bg-[#FCE8E4] text-[#B4321F] dark:bg-[#3b2520] dark:text-[#f4a28c]" },
  excel: { label: "Excel", icon: FileSpreadsheet, tone: "bg-[#E3F4EA] text-[#137A4B] dark:bg-[#17332a] dark:text-[#7fd1a6]" },
  word: { label: "Word", icon: FileText, tone: "bg-[#E4ECFB] text-[#2E4EC4] dark:bg-[#1c2745] dark:text-[#9fb4f2]" },
  powerpoint: { label: "PowerPoint", icon: Presentation, tone: "bg-[#FDEEDF] text-[#B85A12] dark:bg-[#3a2a1a] dark:text-[#f3b47a]" },
  image: { label: "Image", icon: FileImage, tone: "bg-tint text-brand-ink" },
  other: { label: "", icon: File, tone: "bg-soft-2 text-ink-2" },
};

// Past this size a document is not fetched for its preview: the format's thumbnail instead. A size
// the listing does not know is checked on the response itself (readCapped).
const MAX_PREVIEW_BYTES = 30 * 1024 * 1024;
// A workbook part is not inflated past this: a small file may unzip to hundreds of megabytes.
const MAX_XML_PART_BYTES = 20 * 1024 * 1024;

const ext = (name: string) => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "");
const kindLabel = (doc: TurnDoc) => KINDS[doc.kind].label || ext(doc.name).toUpperCase() || "Fichier";

// The documents of one reply, as in a messaging app: each document seen first (its first page, its
// first rows, the start of its text, the picture itself), then its file line with « Télécharger ».
// A click on the preview opens it full size. Each renderer is loaded only when a document needs it.
export function DocumentCards({ agentId, docs }: { agentId: string; docs: TurnDoc[] }) {
  const [open, setOpen] = useState<FileEntry | null>(null);
  if (!docs.length) return null;
  return (
    <>
      <ul aria-label="Documents" className="mt-3 flex flex-col gap-4">
        {docs.map((d) => (
          <li key={d.path} className="min-w-0">
            <button
              type="button"
              aria-label={`Ouvrir ${d.name}`}
              onClick={() => setOpen({ name: d.name, path: d.path, type: "file", size: d.size, modified: d.modified ?? 0, hidden: false })}
              className="block h-60 w-full overflow-hidden rounded-2xl border border-line bg-soft text-left transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 sm:h-80"
            >
              <Preview agentId={agentId} doc={d} />
            </button>
            <FileRow agentId={agentId} doc={d} />
          </li>
        ))}
      </ul>
      <FilePreview agentId={agentId} entry={open} onClose={() => setOpen(null)} />
    </>
  );
}

function FileRow({ agentId, doc }: { agentId: string; doc: TurnDoc }) {
  const { icon: Icon, tone } = KINDS[doc.kind];
  const size = formatBytes(doc.size);
  return (
    <div className="mt-2 flex min-w-0 items-center gap-3 rounded-2xl border border-line bg-surface p-2.5 pl-3">
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", tone)}>
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 grow">
        <span title={doc.name} className="block truncate text-[14px] font-semibold text-ink">
          {doc.name}
        </span>
        <span className="block text-[12.5px] text-ink-3">{size ? `${kindLabel(doc)}, ${size}` : kindLabel(doc)}</span>
      </span>
      <Button asChild className="h-10 shrink-0 rounded-xl px-3 sm:px-4">
        <a href={contentUrl(agentId, doc.path, "attachment")} download={doc.name} aria-label={`Télécharger ${doc.name}`}>
          <Download /> <span className="hidden min-[400px]:inline">Télécharger</span>
        </a>
      </Button>
    </div>
  );
}

// The format's own thumbnail: what is shown for a PowerPoint or anything without a renderer, while a
// preview loads, and whenever a preview fails.
function FormatThumb({ doc }: { doc: TurnDoc }) {
  const { icon: Icon, tone } = KINDS[doc.kind];
  return (
    <span className={cn("flex size-full flex-col items-center justify-center gap-3 px-6 text-center", tone)}>
      <Icon className="size-16" strokeWidth={1.3} />
      <span className="line-clamp-2 max-w-sm text-[14px] font-semibold">{doc.name}</span>
    </span>
  );
}

/** A document drawn as in the chat (first page, first rows, start of the text); its format otherwise. */
export function Preview({ agentId, doc }: { agentId: string; doc: TurnDoc }) {
  const url = contentUrl(agentId, doc.path, "inline");
  const e = ext(doc.name);
  if ((doc.size ?? 0) > MAX_PREVIEW_BYTES) return <FormatThumb doc={doc} />;
  if (doc.kind === "image") return <ImagePreview url={url} doc={doc} />;
  if (doc.kind === "pdf") return <Lazy doc={doc} url={url} render={renderPdf} />;
  if (e === "xlsx" || e === "xlsm" || e === "csv") return <Lazy doc={doc} url={url} render={renderSheet} />;
  if (e === "docx") return <Lazy doc={doc} url={url} render={renderDocx} />;
  return <FormatThumb doc={doc} />;
}

function ImagePreview({ url, doc }: { url: string; doc: TurnDoc }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <FormatThumb doc={doc} />;
  // eslint-disable-next-line @next/next/no-img-element -- streamed by our BFF; an <img> never runs script
  return <img src={url} alt={doc.name} loading="lazy" onError={() => setFailed(true)} className="size-full object-contain" />;
}

type Render = (data: ArrayBuffer, doc: TurnDoc, width: number) => Promise<ReactNode>;

// The body of a preview's response, given up past MAX_PREVIEW_BYTES: on its announced length first,
// then while it streams in (a response without one).
async function readCapped(res: Response, abort: AbortController): Promise<ArrayBuffer> {
  if (Number(res.headers.get("content-length") ?? 0) > MAX_PREVIEW_BYTES) throw new Error("too large");
  if (!res.body) return res.arrayBuffer();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_PREVIEW_BYTES) {
      abort.abort();
      throw new Error("too large");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out.buffer;
}

// Fetches the document once it is on screen, then hands it to its renderer; the thumbnail stays
// while it loads and comes back if anything fails.
function Lazy({ doc, url, render }: { doc: TurnDoc; url: string; render: Render }) {
  const box = useRef<HTMLSpanElement>(null);
  const [node, setNode] = useState<ReactNode | null>(null);
  const [failed, setFailed] = useState(false);
  // The reply's documents are rebuilt on every render: the effect follows the file, not the object.
  const docRef = useRef(doc);
  docRef.current = doc;
  const name = doc.name;
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let alive = true;
    const abort = new AbortController();
    const go = async () => {
      try {
        const res = await fetch(url, { signal: abort.signal });
        if (!res.ok) throw new Error(String(res.status));
        const out = await render(await readCapped(res, abort), docRef.current, el.clientWidth || 600);
        if (alive) setNode(out);
      } catch {
        if (alive) setFailed(true);
      }
    };
    const seen = new IntersectionObserver((entries) => {
      if (entries.some((x) => x.isIntersecting)) {
        seen.disconnect();
        void go();
      }
    });
    seen.observe(el);
    return () => {
      alive = false;
      abort.abort();
      seen.disconnect();
    };
  }, [url, name, render]);
  return (
    <span ref={box} className="block size-full">
      {node && !failed ? node : <FormatThumb doc={doc} />}
    </span>
  );
}

// --- PDF: the first page, drawn by pdf.js (loaded on demand, its worker beside it) ----------------

let pdfWorker: Worker | null = null;

const renderPdf: Render = async (data, _doc, width) => {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (!pdfWorker) {
    pdfWorker = new Worker(new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url), { type: "module" });
    pdfjs.GlobalWorkerOptions.workerPort = pdfWorker;
  }
  const task = pdfjs.getDocument({ data: new Uint8Array(data) });
  let src: string;
  let pages: number;
  // The document leaves the shared worker whether its page is drawn or not.
  try {
    const pdf = await task.promise;
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const viewport = page.getViewport({ scale: (width * ratio) / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvas, viewport }).promise;
    src = canvas.toDataURL("image/png");
    pages = pdf.numPages;
  } finally {
    void task.destroy();
  }
  return (
    <span className="relative block size-full bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element -- a page drawn here, as a data URL */}
      <img src={src} alt="" className="block w-full" />
      <span className="absolute right-3 top-3 rounded-full bg-black/65 px-2.5 py-1 text-[12px] font-semibold text-white">
        1/{pages} {pages > 1 ? "pages" : "page"}
      </span>
    </span>
  );
};

// --- Excel and CSV: the first rows of the first sheet, as a small table ----------------------------

const ROWS = 9;
const COLS = 7;

function Table({ sheet, rows }: { sheet: string | null; rows: string[][] }) {
  const width = Math.min(COLS, Math.max(1, ...rows.map((r) => r.length)));
  return (
    <span className="flex size-full flex-col bg-white text-[#1e1e28]">
      <span className="min-h-0 flex-1 overflow-hidden">
        <table className="w-full border-collapse text-[12.5px]">
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={i === 0 ? "bg-[#E3F4EA] font-semibold" : undefined}>
                {Array.from({ length: width }, (_, j) => (
                  <td key={j} className="max-w-[12rem] truncate border border-[#e3e3ea] px-2 py-1.5">
                    {r[j] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </span>
      {sheet && <span className="shrink-0 border-t border-[#e3e3ea] bg-[#f6f6f9] px-3 py-1.5 text-[12px] font-semibold text-[#137A4B]">{sheet}</span>}
    </span>
  );
}

function parseCsv(text: string): string[][] {
  const lines = text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .slice(0, ROWS);
  const sep = (lines[0]?.match(/;/g)?.length ?? 0) > (lines[0]?.match(/,/g)?.length ?? 0) ? ";" : ",";
  return lines.map((line) => {
    const cells: string[] = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (quoted && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = !quoted;
      } else if (c === sep && !quoted) {
        cells.push(cur);
        cur = "";
      } else cur += c;
    }
    cells.push(cur);
    return cells;
  });
}

// A workbook is a zip of XML parts: the first sheet's name and file, its shared strings, its rows.
// Read with jszip rather than SheetJS, whose npm release carries unfixed advisories.
const colIndex = (ref: string) => [...(ref.match(/^[A-Z]+/)?.[0] ?? "A")].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

async function readXlsx(data: ArrayBuffer): Promise<{ sheet: string | null; rows: string[][] }> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(data);
  const xml = async (path: string) => {
    const part = zip.file(path);
    // jszip's private `_data` holds the part's inflated size, read from the zip before inflating it.
    if (((part as unknown as { _data?: { uncompressedSize?: number } } | null)?._data?.uncompressedSize ?? 0) > MAX_XML_PART_BYTES) throw new Error("too large");
    const text = await part?.async("string");
    return text ? new DOMParser().parseFromString(text, "application/xml") : null;
  };
  const book = await xml("xl/workbook.xml");
  const first = book?.getElementsByTagName("sheet")[0];
  const rid = first?.getAttribute("r:id") ?? first?.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
  const rels = await xml("xl/_rels/workbook.xml.rels");
  const target = [...(rels?.getElementsByTagName("Relationship") ?? [])].find((r) => r.getAttribute("Id") === rid)?.getAttribute("Target") ?? "worksheets/sheet1.xml";
  const sheet = await xml(target.startsWith("/") ? target.slice(1) : `xl/${target}`);
  if (!sheet) throw new Error("no sheet");
  const shared = [...((await xml("xl/sharedStrings.xml"))?.getElementsByTagName("si") ?? [])].map((si) => si.textContent ?? "");
  const number = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
  const rows = [...sheet.getElementsByTagName("row")].slice(0, ROWS).map((row) => {
    const cells: string[] = [];
    for (const c of row.getElementsByTagName("c")) {
      const j = colIndex(c.getAttribute("r") ?? "");
      if (j < 0 || j >= COLS) continue;
      const type = c.getAttribute("t");
      const v = c.getElementsByTagName("v")[0]?.textContent ?? "";
      if (type === "s") cells[j] = shared[Number(v)] ?? "";
      else if (type === "inlineStr") cells[j] = c.getElementsByTagName("is")[0]?.textContent ?? "";
      else cells[j] = type === "str" || type === "b" || !v || isNaN(Number(v)) ? v : number.format(Number(v));
    }
    return Array.from(cells, (x) => x ?? "");
  });
  return { sheet: first?.getAttribute("name") ?? null, rows };
}

const renderSheet: Render = async (data, doc) => {
  const { sheet, rows } = ext(doc.name) === "csv" ? { sheet: null, rows: parseCsv(new TextDecoder().decode(data)) } : await readXlsx(data);
  if (!rows.length) throw new Error("empty");
  return <Table sheet={sheet} rows={rows} />;
};

// --- Word: the start of the text, kept to plain structure, fading out ------------------------------

const KEEP = new Set(["P", "H1", "H2", "H3", "H4", "STRONG", "B", "EM", "I", "UL", "OL", "LI", "TABLE", "TBODY", "TR", "TD", "TH", "BR"]);

// mammoth's HTML, reduced to text structure: no link, no picture, no attribute.
function cleanHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const walk = (node: Element) => {
    for (const child of [...node.children]) {
      walk(child);
      if (!KEEP.has(child.tagName)) child.replaceWith(...child.childNodes);
      else for (const a of [...child.attributes]) child.removeAttribute(a.name);
    }
  };
  const root = doc.body.firstElementChild!;
  walk(root);
  return root.innerHTML;
}

const renderDocx: Render = async (data) => {
  const mammoth = await import("mammoth");
  // Pictures are dropped by cleanHtml anyway: not inlined as base64 in the first place.
  const { value } = await mammoth.convertToHtml({ arrayBuffer: data }, { convertImage: mammoth.images.imgElement(async () => ({ src: "" })) });
  const html = cleanHtml(value);
  if (!html.trim()) throw new Error("empty");
  return (
    <span className="relative block size-full overflow-hidden bg-white px-6 py-5 text-[#1e1e28]">
      <span
        className="block text-[13px] leading-relaxed [&_h1]:mb-2 [&_h1]:text-[18px] [&_h1]:font-bold [&_h2]:mb-1.5 [&_h2]:text-[15px] [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_p]:mb-2 [&_td]:border [&_td]:px-1.5"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-white to-transparent" />
    </span>
  );
};

// The expert's drive folder, and the subfolders changed since `since`, one level down: where the
// files written during a turn are looked for. Empty while nothing is asked or when the listing
// fails; then the cards come from the reply's text alone.
export function useDriveListing(agentId: string, folder: string | null | undefined, since: number | null, refreshKey: string): DriveFile[] {
  const [files, setFiles] = useState<DriveFile[]>([]);
  useEffect(() => {
    if (!folder || since == null) return;
    let alive = true;
    const list = (path: string) => apiFetch<FileListResponse>(`/api/agents/${agentId}/files/list?path=${encodeURIComponent(path)}`);
    (async () => {
      try {
        const root = await list(folder);
        const subs = root.entries.filter((e) => e.type === "directory" && !e.hidden && !isMemoryFolder(e.name) && e.modified >= since).slice(0, 8);
        const deeper = await Promise.allSettled(subs.map((d) => list(d.path)));
        const all: DriveFile[] = [...root.entries];
        for (const r of deeper) if (r.status === "fulfilled") all.push(...r.value.entries);
        if (alive) setFiles(all);
      } catch {
        if (alive) setFiles([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [agentId, folder, since, refreshKey]);
  return files;
}
