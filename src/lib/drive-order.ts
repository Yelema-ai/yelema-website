// The order of a drive folder (Livrables): the memory folder pinned first, then everything else,
// folders and files together, from the newest change to the oldest (or by name, A to Z); an entry
// without a date comes last, by name. And what a member never needs to see there (Leslie, 23/10):
// the expert's working files (code, caches, data) and the preview pictures made for the chat.

/** « memoire », « Mémoire », « MEMORY »: the folder an expert keeps its memory in. */
export function isMemoryFolder(name: string): boolean {
  const plain = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^[._]+/, "");
  return plain === "memoire" || plain === "memory";
}

export type DriveSort = "recent" | "name";

export function sortDriveEntries<E extends { name: string; type: string; modified: number | null | undefined }>(entries: readonly E[], by: DriveSort = "recent"): E[] {
  const pinned = (e: E) => e.type === "directory" && isMemoryFolder(e.name);
  const dated = (e: E) => typeof e.modified === "number" && e.modified > 0;
  return [...entries].sort((a, b) => {
    if (pinned(a) !== pinned(b)) return pinned(a) ? -1 : 1;
    if (by === "name") return a.name.localeCompare(b.name, "fr", { sensitivity: "base", numeric: true });
    if (dated(a) !== dated(b)) return dated(a) ? -1 : 1;
    if (dated(a) && dated(b) && a.modified !== b.modified) return (b.modified as number) - (a.modified as number);
    return a.name.localeCompare(b.name, "fr", { sensitivity: "base", numeric: true });
  });
}

const plain = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

// Code, data and logs the expert works with, and its caches.
const WORKING_FILE = /\.(py|pyc|js|mjs|cjs|ts|sh|json|jsonl|yaml|yml|toml|log|lock|env|ini|cfg|sqlite|db|tmp|bak)$/;
const WORKING_FOLDER = /^(__pycache__|\.?cache|caches|node_modules|tmp|temp|\.venv|venv)$/;
// The pictures made to preview a document in the chat: « apercu.png », « rapport-preview-01.png »,
// « vignette.webp », and the folders that hold them.
const PREVIEW_WORD = /(^|[\s._-])(apercus?|previews?|vignettes?|thumbnails?|thumbs?|miniatures?)([\s._-]|\d|$)/;
const PICTURE = /\.(png|jpe?g|webp|gif|avif)$/;

/** An entry a member does not need in Livrables: shown only with « Afficher les fichiers cachés ». */
export function isDriveClutter(entry: { name: string; type: string }): boolean {
  const name = plain(entry.name);
  if (entry.type === "directory") return WORKING_FOLDER.test(name) || /^(apercus?|previews?|vignettes?|thumbnails?|miniatures?)$/.test(name);
  if (WORKING_FILE.test(name)) return true;
  return PICTURE.test(name) && PREVIEW_WORD.test(name.replace(PICTURE, ""));
}

/** The search of Livrables: every word, in any order, accents and case aside. */
export function matchesDriveQuery(name: string, query: string): boolean {
  const words = plain(query).split(/\s+/).filter(Boolean);
  const target = plain(name);
  return words.every((w) => target.includes(w));
}
