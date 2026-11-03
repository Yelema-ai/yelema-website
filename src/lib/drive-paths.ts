// The drive: ~/Livrables on the member's instance. Experts save their work in their own folder
// there (~/Livrables/<Expert>/), the member uploads documents at its root. No imports: safe in
// client components (the path guard lives in lib/drive.ts, server-side).
export const DRIVE_ROOT = "~/Livrables";
// The same folder as the files API reports it (absolute; the image's home is /home/node).
export const DRIVE_ABS = "/home/node/Livrables";
// Where chat attachments land, so they show up in the Files tab too.
export const ATTACHMENTS_DIR = `${DRIVE_ROOT}/Pièces jointes`;

export function isDriveRoot(path: string): boolean {
  const trimmed = path.replace(/\/+$/, "");
  return trimmed === DRIVE_ROOT || trimmed === DRIVE_ABS;
}

/** Chat d'entreprise : le dossier de son agent (`u-…`) en tête d'un chemin, montré « Mes livrables », jamais l'identifiant. */
export function seatFolderOf(parts: readonly string[]): string | undefined {
  return parts[0] && /^u-[a-z0-9]{6}$/.test(parts[0]) ? parts[0] : undefined;
}

/** The drive a few levels deep, as `/api/agents/{id}/files/tree` answers it (`depth` 0 = the root's own entries). */
export interface DriveTree {
  entries: (import("./types").FileEntry & { depth: number })[];
  /** False when a folder could not be listed: what it holds is missing, not gone. */
  complete: boolean;
}

// What the member brought, not what an Expert made: the chat's attachments (« Pièces jointes ») and
// what was imported into an Expert's folder (« Reçus »). Never a deliverable, never announced as one.
const MEMBER_FOLDER = /(^|\/)(pi[eè]ces jointes|re[cç]us)(\/|$)/i;

export function isMemberUpload(path: string): boolean {
  return MEMBER_FOLDER.test(path.normalize("NFC"));
}

// The upload route names an attachment `<8 random characters>-<original name>` (« 18om3i4g-facture.pdf »):
// on screen, only the original name (Leslie, 30/10). Elsewhere a name is shown as it is.
const UPLOAD_PREFIX = /^[a-z0-9]{8}-(?=.)/;

export function fileLabel(entry: { name: string; path: string }): string {
  if (/(^|\/)pi[eè]ces jointes\//i.test(entry.path.normalize("NFC"))) return entry.name.replace(UPLOAD_PREFIX, "");
  // A Google document's shortcut reads as the document: « Suivi des candidatures », not « ….gsheet ».
  return entry.name.replace(/\.(gsheet|gdoc|gslides)$/i, "");
}

// « Nouveau livrable s.html » said neither who made it nor where it is, and « s.html » was the
// Expert's scratch file; then one document in two formats and its style sheet made three pop-ups over
// the screen (Leslie, 30/10). New files are announced per delivery: one notice per Expert, a document's
// formats together, under a readable name. Scratch files and a page's style or script never count.
const SCRATCH = /^(tmp|temp|test|scratch)([-_ .]|$)|\.(tmp|temp|log|lock|part|crdownload|swp|css|js|mjs|map|woff2?|ttf|otf|ico)$/i;
const FORMATS: Record<string, string> = {
  pdf: "PDF", doc: "Word", docx: "Word", xls: "Excel", xlsx: "Excel", csv: "Excel", ppt: "PowerPoint", pptx: "PowerPoint", gsheet: "Google Sheets", gdoc: "Google Docs", gslides: "Google Slides",
  html: "page web", htm: "page web", md: "texte", txt: "texte", png: "image", jpg: "image", jpeg: "image", webp: "image", svg: "image",
  mp3: "audio", m4a: "audio", wav: "audio", mp4: "vidéo", zip: "archive",
};
const SMALL_WORDS = new Set(["de", "du", "la", "le", "les", "et", "en", "un", "une", "des", "au", "aux", "pour", "par", "sur", "a", "à"]);

/** « 261030-yelema-fiche-de-poste-fde_v1.pdf » → « Yelema fiche de poste FDE »: no date, no version. */
export function readableTitle(name: string): string {
  const words = name
    .replace(/\.[^.]+$/, "")
    .replace(/^\d{6,8}[-_ ]+/, "")
    .replace(/[-_ ]v\d+$/i, "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => (w.length <= 3 && /^\p{Ll}[\p{Ll}\d]*$/u.test(w) && !SMALL_WORDS.has(w) ? w.toUpperCase() : w));
  const text = words.join(" ");
  return text ? text[0].toUpperCase() + text.slice(1) : name;
}

// Only a finished deliverable is announced (Leslie, 30/10: « tout ce qui n'est pas livrable fini, évite
// les pop-ups »): a document, a video, or a picture made for itself. A web page's source, its style, a
// logo or a picture inside an assets folder are the making of a deliverable, never one.
const FINISHED = /\.(pdf|docx?|xlsx?|pptx?|mp4|mov|png|jpe?g|webp|gsheet|gdoc|gslides)$/i;
const PICTURE = /\.(png|jpe?g|webp)$/i;
const PART_NAME = /^(logo|icon|icone|favicon|image|img|photo|capture|screenshot|asset|fond|background|bg|cover)([-_ .\d]|$)/i;
const PART_FOLDER = /(^|\/)(assets?|img|images|static|build|dist|src|sources?|_[^/]*|\.[^/]*)\//i;

function isDeliverable(entry: { name: string; path: string }): boolean {
  const stem = entry.name.replace(/\.[^.]+$/, "");
  if (stem.replace(/[^\p{L}\p{N}]/gu, "").length < 3 || SCRATCH.test(entry.name) || !FINISHED.test(entry.name)) return false;
  if (PICTURE.test(entry.name) && PART_NAME.test(entry.name)) return false;
  const rel = entry.path.startsWith(`${DRIVE_ABS}/`) ? entry.path.slice(DRIVE_ABS.length + 1) : entry.path;
  return !PART_FOLDER.test(rel);
}

export interface DeliveryNotice {
  id: string;
  title: string;
  description: string;
  /** Who delivered (the drive's first folder), "" at the root. */
  expert: string;
  /** Each document under its readable name, formats together: « Fiche FDE (PDF, Word) ». */
  docs: string[];
  /** The folder Ouvrir lands in: the first document's. */
  folder: string;
}

export function deliveryNotices(entries: readonly { name: string; path: string }[]): DeliveryNotice[] {
  const byExpert = new Map<string, Map<string, { title: string; formats: string[]; path: string }>>();
  const kept = entries.filter(isDeliverable);
  // A picture written beside a document in the same delivery is that document's illustration.
  const docFolders = new Set(kept.filter((e) => !PICTURE.test(e.name)).map((e) => e.path.slice(0, e.path.lastIndexOf("/"))));
  for (const e of kept) {
    if (PICTURE.test(e.name) && docFolders.has(e.path.slice(0, e.path.lastIndexOf("/")))) continue;
    const rel = e.path.startsWith(`${DRIVE_ABS}/`) ? e.path.slice(DRIVE_ABS.length + 1) : e.path;
    const parts = rel.split("/");
    const expert = parts.length > 1 ? parts[0] : "";
    const docs = byExpert.get(expert) ?? new Map();
    byExpert.set(expert, docs);
    const title = readableTitle(fileLabel(e));
    const key = `${e.path.slice(0, e.path.lastIndexOf("/"))}/${title}`;
    const ext = /\.([^.]+)$/.exec(e.name)?.[1]?.toLowerCase() ?? "";
    const doc = docs.get(key) ?? { title, formats: [], path: e.path };
    const format = FORMATS[ext] ?? ext.toUpperCase();
    if (format && !doc.formats.includes(format)) doc.formats.push(format);
    docs.set(key, doc);
  }
  return [...byExpert].map(([expert, docs]) => {
    const list = [...docs.values()];
    const named = list.map((d) => (d.formats.length > 1 ? `${d.title} (${d.formats.join(", ")})` : d.title));
    const who = expert ? ` de ${expert}` : "";
    return {
      id: `livrables:${list[0].path}`,
      title: list.length === 1 ? `Nouveau livrable${who}` : `${list.length} nouveaux livrables${who}`,
      description: named.length > 3 ? `${named.slice(0, 3).join(", ")}…` : named.join(", "),
      folder: list[0].path.slice(0, list[0].path.lastIndexOf("/")),
      expert,
      docs: named,
    };
  });
}
