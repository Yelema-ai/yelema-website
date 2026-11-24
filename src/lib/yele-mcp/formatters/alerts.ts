// Les alertes et incidents de l'instance.

import { TELEGRAM_READY_PHASE } from "../hermes-layout.ts";
import { masquerSecrets } from "../secrets.ts";
import type { DiscoveredExpert, IncidentAlertData } from "../types.ts";

/** The Telegram group's state, in words, from the phase telegram.json gives. */
function telegramState(phase: string | null): string {
  if (phase === null) return "non configurée";
  return phase === TELEGRAM_READY_PHASE ? "🟢 Opérationnelle" : "⚠️ En cours de configuration";
}

/** Incidents rendus par appel, et longueur maximale du texte d'une erreur. */
export const INCIDENTS_PER_PAGE = 20;
const ERROR_MAX_CHARS = 300;
const oneLine = (s: string) => (s.length > ERROR_MAX_CHARS ? `${s.slice(0, ERROR_MAX_CHARS)}…` : s).replace(/\s+/g, " ");

export function formatAlertesEtIncidents(
  data: IncidentAlertData | null,
  experts?: DiscoveredExpert[],
  targetExpert?: string,
  page = 1
): string {
  if (!data) {
    return "### 🛡️ Diagnostic de Santé & Alertes\n\nLes alertes de l'instance n'ont pas pu être lues pour le moment.";
  }

  const cleanTarget = targetExpert ? targetExpert.trim().toLowerCase() : undefined;
  const incidents = cleanTarget
    ? data.incidents.filter((i) => i.expert.toLowerCase().includes(cleanTarget))
    : data.incidents;

  const avertissements = cleanTarget
    ? data.avertissements.filter((a) => a.expert.toLowerCase().includes(cleanTarget))
    : data.avertissements;

  let out = `### 🛡️ Diagnostic de Santé, Alertes & Incidents\n\n`;

  if (incidents.length === 0) {
    out += `**Statut global : 🟢 AUCUN INCIDENT DÉTECTÉ**\n\n`;
    out +=
      data.totalCronsScanned > 0
        ? `- **Santé des Routines & Crons** : 🟢 **0 incident détecté** sur ${data.totalCronsScanned} exécutions enregistrées.\n`
        : `- **Santé des Routines & Crons** : aucune exécution enregistrée, donc **0 incident détecté**.\n`;
    out += `- **Passerelle Telegram** : ${telegramState(data.telegramPhase)}.\n\n`;
  } else {
    out += `**Statut global : 🔴 ${incidents.length} INCIDENT(S) DÉTECTÉ(S)**\n\n`;
    // Les plus récents d'abord ; un connecteur en erreur (sans date) est un état présent : en tête.
    const recent = [...incidents].sort((a, b) => (a.ts ? (b.ts ? b.ts.localeCompare(a.ts) : 1) : b.ts ? -1 : 0));
    const pages = Math.ceil(recent.length / INCIDENTS_PER_PAGE);
    const shown = recent.slice((page - 1) * INCIDENTS_PER_PAGE, page * INCIDENTS_PER_PAGE);
    out += `#### 🚨 Incidents Critiques${pages > 1 ? ` (page ${Math.min(page, pages)}/${pages})` : ""} :\n`;
    for (const inc of shown) {
      out += `- **${inc.expert}**${inc.ts ? ` (${inc.ts.slice(0, 16)})` : ""} : ${oneLine(inc.error || inc.note || "Erreur non spécifiée")}\n`;
    }
    if (page < pages) out += `\n(suite : rappeler l'outil avec page=${page + 1})\n`;
    out += `\n`;
  }

  if (avertissements.length > 0) {
    out += `#### ⚠️ Points d'attention & Avertissements (${avertissements.length}) :\n`;
    for (const av of avertissements.slice(0, 10)) {
      out += `- **${av.expert}** : ${av.message || `Outil ${av.outil} en état '${av.etat}'`}\n`;
    }
  }

  return masquerSecrets(out);
}
