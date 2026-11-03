"use client";

import type { ReactNode } from "react";

// A PowerPoint slide drawn as it looks (Leslie, 27/10: « on doit voir la main slide »): its background,
// its pictures and its text boxes at their place and size, in an SVG whose units are the slide's points.
// Charts, tables and effects are left out; a slide with nothing drawable falls back to its text.

const EMU_PER_PT = 12700;
// Pictures inlined in one preview, past which the rest are skipped: a deck of photos stays light.
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_SLIDES = 60;

type Zip = import("jszip");

interface Run {
  text: string;
  size?: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
}

interface Para {
  runs: Run[];
  align?: string;
}

type Item =
  | { kind: "pic"; x: number; y: number; w: number; h: number; src: string }
  | { kind: "box"; x: number; y: number; w: number; h: number; fill?: string; paras: Para[]; anchor?: string };

export interface SlideView {
  w: number;
  h: number;
  bg?: string;
  bgImage?: string;
  items: Item[];
  lines: string[];
}

const NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

const kids = (el: Element, name: string) => [...el.children].filter((c) => c.localName === name);
const kid = (el: Element | null | undefined, name: string) => (el ? kids(el, name)[0] : undefined);
const num = (v: string | null | undefined) => (v ? Number(v) || 0 : 0);
const slideNo = (p: string) => Number(/(\d+)\.xml$/.exec(p)?.[1] ?? 0);

function dirOf(path: string) {
  return path.slice(0, path.lastIndexOf("/") + 1);
}

// "../media/image1.png" seen from "ppt/slides/" is "ppt/media/image1.png".
function resolve(base: string, target: string) {
  if (target.startsWith("/")) return target.slice(1);
  const parts = (dirOf(base) + target).split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (p === "..") out.pop();
    else if (p !== "." && p) out.push(p);
  }
  return out.join("/");
}

async function xmlOf(zip: Zip, path: string): Promise<Document | null> {
  const text = await zip.file(path)?.async("string");
  return text ? new DOMParser().parseFromString(text, "application/xml") : null;
}

async function relsOf(zip: Zip, path: string): Promise<Map<string, { type: string; target: string }>> {
  const rels = await xmlOf(zip, `${dirOf(path)}_rels/${path.slice(path.lastIndexOf("/") + 1)}.rels`);
  const map = new Map<string, { type: string; target: string }>();
  for (const r of rels ? [...rels.getElementsByTagName("Relationship")] : []) {
    if (r.getAttribute("TargetMode") === "External") continue;
    map.set(r.getAttribute("Id") ?? "", { type: r.getAttribute("Type") ?? "", target: resolve(path, r.getAttribute("Target") ?? "") });
  }
  return map;
}

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml", webp: "image/webp", bmp: "image/bmp" };

class Images {
  used = 0;
  cache = new Map<string, string | null>();
  constructor(private zip: Zip) {}
  async get(path: string): Promise<string | null> {
    if (this.cache.has(path)) return this.cache.get(path)!;
    const mime = MIME[path.split(".").pop()?.toLowerCase() ?? ""];
    const file = this.zip.file(path);
    let src: string | null = null;
    if (mime && file) {
      const b64 = await file.async("base64");
      const bytes = (b64.length * 3) / 4;
      if (this.used + bytes <= MAX_IMAGE_BYTES) {
        this.used += bytes;
        src = `data:${mime};base64,${b64}`;
      }
    }
    this.cache.set(path, src);
    return src;
  }
}

// The theme's colour names (accent1, dk1…) to hex, for the colours a slide gives by name.
async function themeColors(zip: Zip): Promise<Record<string, string>> {
  const theme = await xmlOf(zip, "ppt/theme/theme1.xml");
  const scheme = theme?.getElementsByTagNameNS(NS_A, "clrScheme")[0];
  const out: Record<string, string> = {};
  for (const c of scheme ? [...scheme.children] : []) {
    const v = kid(c, "srgbClr")?.getAttribute("val") ?? kid(c, "sysClr")?.getAttribute("lastClr");
    if (v) out[c.localName] = `#${v}`;
  }
  out.tx1 = out.dk1 ?? "#000000";
  out.bg1 = out.lt1 ?? "#FFFFFF";
  out.tx2 = out.dk2 ?? out.tx1;
  out.bg2 = out.lt2 ?? out.bg1;
  return out;
}

function colorOf(fill: Element | undefined, theme: Record<string, string>): string | undefined {
  if (!fill) return undefined;
  const srgb = kid(fill, "srgbClr")?.getAttribute("val");
  if (srgb) return `#${srgb}`;
  const scheme = kid(fill, "schemeClr")?.getAttribute("val");
  return scheme ? theme[scheme] : undefined;
}

interface Frame {
  ox: number;
  oy: number;
  sx: number;
  sy: number;
}

const IDENTITY: Frame = { ox: 0, oy: 0, sx: 1, sy: 1 };

// A shape's box in slide points, through the groups that contain it.
function boxOf(spPr: Element | undefined, f: Frame) {
  const xfrm = kid(spPr, "xfrm");
  const off = kid(xfrm, "off");
  const ext = kid(xfrm, "ext");
  if (!off || !ext) return null;
  return {
    x: (f.ox + num(off.getAttribute("x")) * f.sx) / EMU_PER_PT,
    y: (f.oy + num(off.getAttribute("y")) * f.sy) / EMU_PER_PT,
    w: (num(ext.getAttribute("cx")) * f.sx) / EMU_PER_PT,
    h: (num(ext.getAttribute("cy")) * f.sy) / EMU_PER_PT,
  };
}

// What a placeholder inherits from the master when the slide does not say: size in points, alignment.
function phDefaults(sp: Element): { size: number; align?: string } {
  const type = kid(kid(kid(sp, "nvSpPr"), "nvPr"), "ph")?.getAttribute("type");
  if (type === "ctrTitle") return { size: 40, align: "ctr" };
  if (type === "title") return { size: 36 };
  if (type === "subTitle") return { size: 24, align: "ctr" };
  if (kid(kid(kid(sp, "nvSpPr"), "nvPr"), "ph")) return { size: 22 };
  return { size: 18 };
}

function parasOf(txBody: Element | undefined, theme: Record<string, string>, dflt: { size: number; align?: string }): Para[] {
  if (!txBody) return [];
  return kids(txBody, "p").map((p) => {
    const align = kid(p, "pPr")?.getAttribute("algn") ?? dflt.align;
    const runs = [...kids(p, "r"), ...kids(p, "fld")].map((r) => {
      const rPr = kid(r, "rPr");
      return {
        text: kid(r, "t")?.textContent ?? "",
        size: rPr?.getAttribute("sz") ? num(rPr.getAttribute("sz")) / 100 : dflt.size,
        bold: rPr?.getAttribute("b") === "1",
        italic: rPr?.getAttribute("i") === "1",
        color: colorOf(kid(rPr, "solidFill"), theme),
      };
    });
    return { runs, align };
  });
}

type Box = { x: number; y: number; w: number; h: number };

// A placeholder (title, body) placed by the layout keeps no position of its own on the slide.
const phKeys = (sp: Element) => {
  const ph = kid(kid(kid(sp, "nvSpPr"), "nvPr"), "ph");
  if (!ph) return [];
  const type = ph.getAttribute("type") ?? "body";
  return [`idx:${ph.getAttribute("idx") ?? ""}`, `type:${type}`, ...(type === "ctrTitle" ? ["type:title"] : [])];
};

async function layoutBoxes(zip: Zip, slidePath: string): Promise<Map<string, Box>> {
  const out = new Map<string, Box>();
  const layout = [...(await relsOf(zip, slidePath)).values()].find((r) => /slideLayout$/.test(r.type));
  const doc = layout ? await xmlOf(zip, layout.target) : null;
  for (const sp of doc ? [...doc.getElementsByTagName("p:sp")] : []) {
    const box = boxOf(kid(sp, "spPr"), IDENTITY);
    if (box) for (const k of phKeys(sp)) if (!out.has(k)) out.set(k, box);
  }
  return out;
}

async function walk(tree: Element, f: Frame, rels: Map<string, { target: string }>, images: Images, theme: Record<string, string>, items: Item[], placed: Map<string, Box>) {
  for (const el of [...tree.children]) {
    if (el.localName === "sp") {
      const spPr = kid(el, "spPr");
      const box = boxOf(spPr, f) ?? phKeys(el).map((k) => placed.get(k)).find(Boolean) ?? null;
      const paras = parasOf(kid(el, "txBody"), theme, phDefaults(el));
      const fill = colorOf(kid(spPr, "solidFill"), theme);
      const hasText = paras.some((p) => p.runs.some((r) => r.text.trim()));
      if (box && (hasText || fill)) {
        const anchor = kid(kid(el, "txBody"), "bodyPr")?.getAttribute("anchor") ?? undefined;
        items.push({ kind: "box", ...box, fill, paras: hasText ? paras : [], anchor });
      }
    } else if (el.localName === "pic") {
      const box = boxOf(kid(el, "spPr"), f);
      const blip = kid(el, "blipFill")?.getElementsByTagNameNS(NS_A, "blip")[0];
      const target = rels.get(blip?.getAttributeNS(NS_R, "embed") ?? "")?.target;
      const src = target ? await images.get(target) : null;
      if (box && src) items.push({ kind: "pic", ...box, src });
    } else if (el.localName === "grpSp") {
      const xfrm = kid(kid(el, "grpSpPr"), "xfrm");
      const off = kid(xfrm, "off");
      const ext = kid(xfrm, "ext");
      const chOff = kid(xfrm, "chOff");
      const chExt = kid(xfrm, "chExt");
      const sx = num(chExt?.getAttribute("cx")) ? num(ext?.getAttribute("cx")) / num(chExt?.getAttribute("cx")) : 1;
      const sy = num(chExt?.getAttribute("cy")) ? num(ext?.getAttribute("cy")) / num(chExt?.getAttribute("cy")) : 1;
      const inner: Frame = {
        sx: f.sx * sx,
        sy: f.sy * sy,
        ox: f.ox + (num(off?.getAttribute("x")) - num(chOff?.getAttribute("x")) * sx) * f.sx,
        oy: f.oy + (num(off?.getAttribute("y")) - num(chOff?.getAttribute("y")) * sy) * f.sy,
      };
      await walk(el, inner, rels, images, theme, items, placed);
    }
  }
}

// The background of a slide, else of its layout, else of its master: a colour or a picture.
async function backgroundOf(zip: Zip, path: string, images: Images, theme: Record<string, string>, depth = 0): Promise<{ bg?: string; bgImage?: string }> {
  const doc = await xmlOf(zip, path);
  const bgPr = doc?.getElementsByTagNameNS("http://schemas.openxmlformats.org/presentationml/2006/main", "bgPr")[0];
  const rels = await relsOf(zip, path);
  if (bgPr) {
    const blip = kid(bgPr, "blipFill")?.getElementsByTagNameNS(NS_A, "blip")[0];
    const target = rels.get(blip?.getAttributeNS(NS_R, "embed") ?? "")?.target;
    const src = target ? await images.get(target) : null;
    if (src) return { bgImage: src };
    const color = colorOf(kid(bgPr, "solidFill"), theme);
    if (color) return { bg: color };
  }
  if (depth >= 2) return {};
  const up = [...rels.values()].find((r) => /slideLayout$|slideMaster$/.test(r.type));
  return up ? backgroundOf(zip, up.target, images, theme, depth + 1) : {};
}

export async function readSlides(data: ArrayBuffer, maxXmlBytes: number, only?: number): Promise<SlideView[]> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(data);
  const pres = await xmlOf(zip, "ppt/presentation.xml");
  const size = pres?.getElementsByTagName("p:sldSz")[0];
  const w = num(size?.getAttribute("cx")) / EMU_PER_PT || 960;
  const h = num(size?.getAttribute("cy")) / EMU_PER_PT || 540;
  const theme = await themeColors(zip);
  const images = new Images(zip);
  const parts = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => slideNo(a) - slideNo(b))
    .slice(0, MAX_SLIDES);
  const slides: SlideView[] = [];
  for (const [i, p] of parts.entries()) {
    const part = zip.file(p);
    if (((part as unknown as { _data?: { uncompressedSize?: number } } | null)?._data?.uncompressedSize ?? 0) > maxXmlBytes) continue;
    const xml = new DOMParser().parseFromString((await part?.async("string")) ?? "", "application/xml");
    const lines = [...xml.getElementsByTagNameNS(NS_A, "p")]
      .map((para) => [...para.getElementsByTagNameNS(NS_A, "t")].map((t) => t.textContent ?? "").join("").trim())
      .filter(Boolean);
    const view: SlideView = { w, h, items: [], lines };
    // Only the slides on screen get their pictures: the card shows the first one alone.
    if (only === undefined || i < only) {
      const rels = await relsOf(zip, p);
      const tree = xml.getElementsByTagName("p:spTree")[0];
      if (tree) await walk(tree, IDENTITY, rels, images, theme, view.items, await layoutBoxes(zip, p));
      Object.assign(view, await backgroundOf(zip, p, images, theme));
    }
    slides.push(view);
  }
  if (!slides.length) throw new Error("no slide");
  return slides;
}

const ALIGN: Record<string, "left" | "center" | "right" | "justify"> = { l: "left", ctr: "center", r: "right", just: "justify" };
const ANCHOR: Record<string, string> = { t: "flex-start", ctr: "center", b: "flex-end" };

export function SlideDrawing({ slide, n, of }: { slide: SlideView; n: number; of: number }): ReactNode {
  const { w, h } = slide;
  return (
    <span className="relative block w-full overflow-hidden rounded-lg border border-[#e3e3ea] shadow-sm" style={{ aspectRatio: `${w} / ${h}`, background: slide.bg ?? "#FFFFFF" }}>
      <svg viewBox={`0 0 ${w} ${h}`} className="absolute inset-0 size-full" preserveAspectRatio="xMidYMid meet" aria-hidden>
        {slide.bgImage && <image href={slide.bgImage} x={0} y={0} width={w} height={h} preserveAspectRatio="xMidYMid slice" />}
        {slide.items.map((it, i) =>
          it.kind === "pic" ? (
            <image key={i} href={it.src} x={it.x} y={it.y} width={it.w} height={it.h} preserveAspectRatio="none" />
          ) : (
            <g key={i}>
              {it.fill && <rect x={it.x} y={it.y} width={it.w} height={it.h} fill={it.fill} />}
              {it.paras.length > 0 && (
                <foreignObject x={it.x} y={it.y} width={Math.max(it.w, 1)} height={Math.max(it.h, 1)}>
                  <div
                    style={{ display: "flex", flexDirection: "column", justifyContent: ANCHOR[it.anchor ?? "t"] ?? "flex-start", height: "100%", padding: "3.6px 7.2px", boxSizing: "border-box", overflow: "hidden", fontFamily: "Calibri, Arial, sans-serif", color: "#1e1e28", lineHeight: 1.15 }}
                  >
                    {it.paras.map((p, j) => (
                      <div key={j} style={{ textAlign: ALIGN[p.align ?? "l"] ?? "left", minHeight: "0.6em" }}>
                        {p.runs.map((r, k) => (
                          <span key={k} style={{ fontSize: r.size ?? 18, fontWeight: r.bold ? 700 : 400, fontStyle: r.italic ? "italic" : undefined, color: r.color }}>
                            {r.text}
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>
                </foreignObject>
              )}
            </g>
          ),
        )}
      </svg>
      <span className="absolute bottom-1.5 right-2.5 rounded bg-white/80 px-1 text-[11px] font-semibold text-[#8a8a98]">
        {n}/{of}
      </span>
    </span>
  );
}

/** Whether a slide read for its picture has anything to draw; otherwise its text is shown instead. */
export const drawable = (s: SlideView) => s.items.length > 0 || Boolean(s.bgImage);
