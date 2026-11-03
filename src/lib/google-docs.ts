// Google Sheets, Docs and Slides an Expert works in (Leslie, 31/10): they live in Google Drive, not in
// ~/Livrables, so the chat only had a link lost in an old message. Here: the documents a reply points
// to (one per file, whatever the link's form), the title to show, and the shortcut the Expert keeps
// in its drive for each one (« Suivi des candidatures.gsheet », the format of Google Drive for
// desktop: JSON with the url) so its Livrables tab lists them too. No imports: tested.

export type GoogleKind = "sheets" | "docs" | "slides";

export interface GoogleDoc {
  id: string;
  kind: GoogleKind;
  url: string;
  title: string;
}

export const GOOGLE_LABEL: Record<GoogleKind, string> = { sheets: "Google Sheets", docs: "Google Docs", slides: "Google Slides" };

const PATH_KIND: Record<string, GoogleKind> = { spreadsheets: "sheets", document: "docs", presentation: "slides" };
const URL_RE = /https:\/\/docs\.google\.com\/(spreadsheets|document|presentation)\/d\/([A-Za-z0-9_-]{20,})[^\s)\]>"'«»]*/g;
const LINK_RE = /\[([^\]\n]+)\]\(<?(https:\/\/docs\.google\.com\/(?:spreadsheets|document|presentation)\/d\/[A-Za-z0-9_-]{20,}[^\s)>]*)>?\)/g;
// « 🔗 [Ouvrir le suivi des candidatures](https://docs.google.com/…) » alone on its line: the card
// under the reply says it, the line goes.
const ACTION_LINE = /^[^\S\n]*(?:[-*•][^\S\n]+)?(?:\p{Extended_Pictographic}️?[^\S\n]*)?\[(?:Ouvrir|Voir|Consulter|Accéder|Lien)\b[^\]\n]*\]\(<?https:\/\/docs\.google\.com\/(?:spreadsheets|document|presentation)\/d\/[^)\n]+\)[^\S\n]*$/gmu;

/** The Google document a url points to, or null. */
export function googleDocOf(url: string): Omit<GoogleDoc, "title"> | null {
  const m = new RegExp(URL_RE.source).exec(url);
  if (!m) return null;
  const kind = PATH_KIND[m[1]];
  return { id: m[2], kind, url: `https://docs.google.com/${m[1]}/d/${m[2]}/edit` };
}

/** « Ouvrir le suivi des candidatures » → « Suivi des candidatures »; null for a label that names nothing. */
export function titleFromLabel(label: string): string | null {
  const t = label
    .replace(/\*\*|__|`/g, "")
    .replace(/^\s*(?:ouvrir|voir|consulter|accéder\s+à|lien\s+vers)\s+(?:le\s+|la\s+|les\s+|l['’]\s*|au\s+|à\s+la\s+)?/i, "")
    .replace(/^(?:google\s+)?(?:sheets?|docs?|slides?|document|fichier|tableau|lien|ici)\s*$/i, "")
    .trim();
  if (t.length < 3 || /^https?:/i.test(t)) return null;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** The Google documents a reply points to, in order, each once, with the best title its text gives. */
export function googleDocs(text: string): GoogleDoc[] {
  const found = new Map<string, GoogleDoc>();
  for (const m of text.matchAll(LINK_RE)) {
    const doc = googleDocOf(m[2]);
    if (!doc) continue;
    const title = titleFromLabel(m[1]);
    const had = found.get(doc.id);
    if (!had) found.set(doc.id, { ...doc, title: title ?? GOOGLE_LABEL[doc.kind] });
    else if (title && had.title === GOOGLE_LABEL[doc.kind]) had.title = title;
  }
  for (const m of text.matchAll(URL_RE)) {
    const doc = googleDocOf(m[0]);
    if (doc && !found.has(doc.id)) found.set(doc.id, { ...doc, title: GOOGLE_LABEL[doc.kind] });
  }
  return [...found.values()];
}

/** The reply without its « Ouvrir … » lines to Google documents, which become cards. */
export function withoutGoogleActions(text: string): string {
  return text.replace(ACTION_LINE, "").replace(/\n{3,}/g, "\n\n").trim();
}

// ── Shortcuts in the drive ────────────────────────────────────────────────────────────────────

const SHORTCUT_EXT: Record<string, GoogleKind> = { gsheet: "sheets", gdoc: "docs", gslides: "slides" };

/** The kind of a shortcut file (« Suivi.gsheet »), or null for any other file. */
export function shortcutKind(name: string): GoogleKind | null {
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  return SHORTCUT_EXT[ext] ?? null;
}

/** « Suivi des candidatures.gsheet » → « Suivi des candidatures ». */
export function shortcutTitle(name: string): string {
  return name.replace(/\.(gsheet|gdoc|gslides)$/i, "");
}

/** The document a shortcut file points to: `{"url": …}` (ours) or `{"doc_id": …}` (Google Drive for desktop). */
export function parseShortcut(name: string, body: string): GoogleDoc | null {
  const kind = shortcutKind(name);
  if (!kind) return null;
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  const title = typeof o.title === "string" && o.title.trim() ? o.title.trim() : shortcutTitle(name);
  if (typeof o.url === "string") {
    const doc = googleDocOf(o.url);
    if (doc) return { ...doc, title };
  }
  if (typeof o.doc_id === "string" && /^[A-Za-z0-9_-]{20,}$/.test(o.doc_id)) {
    const path = { sheets: "spreadsheets", docs: "document", slides: "presentation" }[kind];
    return { id: o.doc_id, kind, url: `https://docs.google.com/${path}/d/${o.doc_id}/edit`, title };
  }
  return null;
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ");

/**
 * The documents a discussion uses, the last one used first. A reply uses a document when it links to
 * it, or when it names one already linked by its title (« … à jour dans le suivi des candidatures »):
 * the Expert works on the same Sheet without repeating its link (Leslie, 31/10).
 */
export function usedGoogleDocs(replies: { text: string; at: number | null }[]): (GoogleDoc & { usedAt: number | null })[] {
  const seen = new Map<string, GoogleDoc & { usedAt: number | null }>();
  for (const { text, at } of replies) {
    const linked = googleDocs(text);
    const named = [...seen.values()].filter((d) => !d.title.startsWith("Google ") && d.title.split(" ").length > 1 && fold(text).includes(fold(d.title)));
    for (const d of [...named, ...linked]) {
      const had = seen.get(d.id);
      const title = had && d.title.startsWith("Google ") ? had.title : d.title;
      seen.delete(d.id);
      seen.set(d.id, { id: d.id, kind: d.kind, url: d.url, title, usedAt: at });
    }
  }
  return [...seen.values()].reverse();
}
