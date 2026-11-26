import "server-only";
import { composioUserId, listConnections, memberComposioId, runMemberTool } from "@/lib/composio";
import { accountState } from "@/lib/connection-accounts";
import { integrations } from "@/lib/integrations";
import { memo } from "@/lib/memo";
import type { AgentRow } from "@/lib/types";
import type { AgendaCalendar } from "./agenda";
import { CALENDAR_TOOLKITS, agendaEvents, agendaRequest, isCalendarToolkit, type AgendaEvent } from "./calendar";

export interface ConnectedCalendar extends AgendaCalendar {
  label: string;
  email: string | null;
}

export class AgendaUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgendaUnavailable";
  }
}

interface AgendaRead {
  at: number;
  events: AgendaEvent[];
}

const READ_KEEP_MS = 15 * 60_000;
const OWNER_KEEP_MS = 10 * 60_000;
const CACHE_ENTRIES = 500;

const reads = memo<AgendaRead>({ ttlMs: READ_KEEP_MS, maxEntries: CACHE_ENTRIES });
const owners = memo<boolean>({ ttlMs: OWNER_KEEP_MS, ttlOf: (owned) => (owned ? OWNER_KEEP_MS : 0), maxEntries: CACHE_ENTRIES });

export async function connectedCalendars(row: AgentRow): Promise<ConnectedCalendar[]> {
  if (!row.apps_token_hash) return [];
  const { connections } = await integrations.connections(row);
  return connections.flatMap((c) => {
    const toolkit = c.toolkitSlug?.toLowerCase();
    if (!isCalendarToolkit(toolkit) || accountState(c) !== "active" || !c.id) return [];
    return [{ toolkit, account: c.id, label: CALENDAR_TOOLKITS[toolkit], email: c.email ?? null }];
  });
}

export const memberIdentity = (row: AgentRow): string => composioUserId(row);

export const memberIdentityOf = (userId: string): string => memberComposioId(userId);

const ownsAccount = (member: string, account: string): Promise<boolean> =>
  owners.get(`${member}\n${account}`, async () => (await listConnections(member)).connections.some((c) => c.id === account));

export async function readAgenda(member: string, calendar: AgendaCalendar, now: number, maxAgeMs = 0): Promise<AgendaEvent[]> {
  if (!(await ownsAccount(member, calendar.account))) throw new AgendaUnavailable("calendar account is not the member's");
  const key = `${member}\n${calendar.account}`;
  const kept = reads.peek(key);
  if (kept && now - kept.at <= maxAgeMs) return kept.events;
  const { slug, args } = agendaRequest(calendar.toolkit, now);
  const run = await runMemberTool(member, calendar.account, slug, args);
  if (!run.ok) throw new AgendaUnavailable(`${slug}: ${run.error?.slice(0, 300) ?? "refused"}`);
  const events = agendaEvents(calendar.toolkit, run.data, now);
  reads.put(key, { at: now, events });
  return events;
}
