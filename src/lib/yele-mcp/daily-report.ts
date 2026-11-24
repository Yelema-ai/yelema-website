// Le rapport journalier de mémoire : le jour demandé, les fichiers où il peut se trouver, et sa lecture.
import { dailyReportFiles } from "./hermes-layout.ts";
import { masquerSecrets } from "./secrets.ts";

/** Format strict de date : AAAA-MM-JJ */
const STRICT_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Le jour demandé (AAAA-MM-JJ), vide ou « aujourdhui » / « hier » compris ; null si la date est invalide. */
export function reportDate(dateStr?: string, now = Date.now()): string | null {
  let targetDate = (dateStr ?? "").trim().toLowerCase();
  if (!targetDate || targetDate === "aujourdhui" || targetDate === "today") {
    targetDate = new Date(now).toISOString().slice(0, 10);
  } else if (targetDate === "hier" || targetDate === "yesterday") {
    targetDate = new Date(now - 24 * 3600 * 1000).toISOString().slice(0, 10);
  }
  // SÉCURITÉ ANTI-PATH TRAVERSAL : rejet strict si le format n'est pas AAAA-MM-JJ
  return STRICT_DATE_REGEX.test(targetDate) ? targetDate : null;
}

/** Les fichiers où le plugin de mémoire a pu écrire le rapport d'un jour, dans l'ordre où on les cherche. */
export const reportPaths = (date: string): string[] => dailyReportFiles(date);

/** Le premier rapport non vide trouvé pour le jour demandé, secrets masqués. */
/** Caractères d'un rapport rendus par appel ; la suite se lit page par page. */
export const REPORT_PAGE_CHARS = 10_000;

export async function readDailyReport(
  fetchFileContent: (path: string) => Promise<string | null>,
  dateStr?: string,
  page = 1
): Promise<string> {
  const targetDate = reportDate(dateStr);
  if (!targetDate) {
    return "Format de date invalide. Veuillez indiquer une date au format AAAA-MM-JJ (ex: 2026-10-28) ou 'aujourdhui' / 'hier'.";
  }

  for (const p of reportPaths(targetDate)) {
    try {
      const content = await fetchFileContent(p);
      if (content && content.trim()) {
        const whole = masquerSecrets(content.trim());
        const pages = Math.ceil(whole.length / REPORT_PAGE_CHARS);
        if (page > pages) return `Le rapport du **${targetDate}** n'a que ${pages} page(s).`;
        const part = whole.slice((page - 1) * REPORT_PAGE_CHARS, page * REPORT_PAGE_CHARS);
        const where = pages > 1 ? `, page ${page}/${pages}` : "";
        const next = page < pages ? `\n\n(suite : rappeler l'outil avec page=${page + 1})` : "";
        return `### 📝 Rapport Journalier de Mémoire (${targetDate}${where})\n\n${part}${next}`;
      }
    } catch {}
  }

  return `Aucun rapport de mémoire n'a encore été consolidé pour le **${targetDate}** sur l'instance. Les sessions en cours seront intégrées lors du prochain cycle de synthèse.`;
}
