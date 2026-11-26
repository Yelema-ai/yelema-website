import type { MeetingStatus, MeetingView } from "./view.ts";

export type StatusTone = "live" | "progress" | "action" | "done" | "error" | "muted";

export const STATUS_LABELS: Record<MeetingStatus, { label: string; tone: StatusTone }> = {
  scheduled: { label: "Programmée", tone: "muted" },
  joining: { label: "Arrivée en cours", tone: "live" },
  waiting: { label: "En salle d’attente", tone: "live" },
  in_meeting: { label: "En réunion", tone: "live" },
  processing: { label: "Transcription en cours", tone: "progress" },
  writing: { label: "CR en rédaction", tone: "progress" },
  stalled: { label: "CR non rédigé", tone: "error" },
  to_send: { label: "CR à envoyer", tone: "action" },
  sending: { label: "Envoi en cours", tone: "progress" },
  sent: { label: "CR envoyé", tone: "done" },
  not_admitted: { label: "Accès refusé", tone: "error" },
  failed: { label: "Échec", tone: "error" },
  empty: { label: "Aucun échange", tone: "muted" },
};

export const PLATFORM_LABELS = { meet: "Google Meet", teams: "Microsoft Teams" } as const;

export const counted = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

export const capitalized = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

const dayKey = (at: Date, timeZone?: string) => at.toLocaleDateString("fr-CA", { timeZone });

export function dayAndTime(iso: string, now: Date, timeZone?: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const time = at.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone });
  const key = dayKey(at, timeZone);
  const day =
    key === dayKey(now, timeZone)
      ? "Aujourd’hui"
      : key === dayKey(new Date(now.getTime() - 86_400_000), timeZone)
        ? "Hier"
        : key === dayKey(new Date(now.getTime() + 86_400_000), timeZone)
          ? "Demain"
          : Math.abs(now.getTime() - at.getTime()) < 6 * 86_400_000
            ? at.toLocaleDateString("fr-FR", { weekday: "long", timeZone })
            : at.toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone });
  return `${capitalized(day)}, ${time}`;
}

export function durationLabel(view: Pick<MeetingView, "joinedAt" | "endedAt">): string | null {
  const minutes = durationMinutes(view);
  if (minutes === null) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h${m ? ` ${String(m).padStart(2, "0")}` : ""}` : `${m} min`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
}

export function durationMinutes(view: Pick<MeetingView, "joinedAt" | "endedAt">): number | null {
  if (!view.joinedAt || !view.endedAt) return null;
  const ms = Date.parse(view.endedAt) - Date.parse(view.joinedAt);
  return Number.isFinite(ms) && ms > 0 ? Math.max(1, Math.round(ms / 60_000)) : null;
}

export const meetingTitle = (view: Pick<MeetingView, "minutes" | "event" | "platform">): string => view.minutes?.title ?? view.event?.title ?? `Réunion ${PLATFORM_LABELS[view.platform]}`;

export function listMeta(view: MeetingView, now: Date, timeZone?: string): string {
  const parts = [dayAndTime(view.joinedAt ?? view.event?.start ?? view.createdAt, now, timeZone)];
  if (view.minutes) parts.push(counted(view.minutes.tasks.length, "tâche", "tâches"));
  else if (view.participants.length) parts.push(counted(view.participants.length, "personne", "personnes"));
  return parts.filter(Boolean).join(" · ");
}

function atLabel(iso: string, now: Date, timeZone?: string): string {
  const label = dayAndTime(iso, now, timeZone);
  const cut = label.lastIndexOf(", ");
  return cut < 0 ? label : `${label.slice(0, cut).toLowerCase()} à ${label.slice(cut + 2)}`;
}

export function deliveryNote(view: Pick<MeetingView, "deliveries">, now: Date, timeZone?: string): string | null {
  const last = view.deliveries.at(-1);
  if (!last) return null;
  return `Envoyé à ${counted(last.to.length, "destinataire", "destinataires")}, ${atLabel(last.at, now, timeZone)}`;
}

export const clock = (iso: string, timeZone?: string): string => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone });

export function dayHeading(at: Date, now: Date, timeZone?: string): string {
  const key = dayKey(at, timeZone);
  if (key === dayKey(now, timeZone)) return "Aujourd’hui";
  if (key === dayKey(new Date(now.getTime() + 86_400_000), timeZone)) return "Demain";
  return capitalized(at.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone }));
}
