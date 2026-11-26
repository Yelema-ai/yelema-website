import "server-only";
import { after } from "next/server";
import { workspaceBrand } from "@/lib/app-context";
import { requireAgentAccess, requireUser, type SessionUser } from "@/lib/auth";
import { loadCatalogue, matchCatalogue } from "@/lib/catalogue";
import { ApiError } from "@/lib/http";
import type { MeetingScope } from "@/lib/meetings/drive";
import { isHexColor } from "@/lib/meetings/minutes-palette";
import { httpsUrl } from "@/lib/meetings/record";
import { connectedCalendars, memberIdentity, readAgenda, type ConnectedCalendar } from "@/lib/meetings/calendars";
import { isNotetaker } from "@/lib/meetings/notetaker";
import { companyDirectory, senderOptions, sendFromConnected, sendFromExpert } from "@/lib/meetings/senders";
import type { AgendaPorts, Defer, MeetingRequester, SendPorts } from "@/lib/meetings/service";
import { resolveProfile } from "@/lib/profiles";
import { multiTenant, siteUrl } from "@/lib/runtime-config";
import { requestSiteOrigin } from "@/lib/site-url";
import { hostOf } from "@/lib/tenant-resolver";
import type { AgentRow } from "@/lib/types";

export interface MeetingAccess {
  scope: MeetingScope;
  user: SessionUser;
  row: AgentRow;
  expertKey: string | null;
}

export async function meetingScope(agentId: string, rawProfile: unknown): Promise<MeetingAccess> {
  const { row } = await requireAgentAccess(agentId);
  const profile = await resolveProfile(row, rawProfile);
  const entry = matchCatalogue((await loadCatalogue()).experts, profile);
  if (!isNotetaker(profile, entry?.key, entry?.name)) throw new ApiError(404, "not_found", "Cet expert ne rejoint pas de réunions.");
  const { user } = await requireUser();
  return { scope: { agentId: row.agent37_id, profile, userId: user.id, workspace: row.workspace_id }, user, row, expertKey: entry?.key ?? null };
}

export async function meetingRequester({ user, row }: MeetingAccess): Promise<MeetingRequester> {
  const brand = await workspaceBrand(row.workspace_id);
  return { name: user.name?.trim() || null, email: user.email, company: brand.name, logo: httpsUrl(brand.logoUrl), color: isHexColor(brand.color) ? brand.color : null };
}

export function sendPorts(access: MeetingAccess, request: Request): SendPorts {
  const origin = requestSiteOrigin(multiTenant(), siteUrl(), hostOf(request.headers), new URL(request.url).origin);
  return {
    me: access.user.email,
    origin,
    company: () => companyDirectory(access.row.workspace_id, access.user.email),
    senders: () => senderOptions(access.row, access.expertKey),
    sendFromExpert: (expert, to, email) => sendFromExpert(expert, to, { subject: email.subject, text: email.text, html: email.html }),
    sendFromConnected: (account, to, email) => sendFromConnected(access.row, account, to, email),
  };
}

export async function agendaPorts(access: MeetingAccess): Promise<AgendaPorts> {
  const member = memberIdentity(access.row);
  let calendars: Promise<ConnectedCalendar[]> | null = null;
  return {
    host: await meetingRequester(access),
    calendars: () => (calendars ??= connectedCalendars(access.row)),
    read: (calendar, now, maxAgeMs) => readAgenda(member, calendar, now, maxAgeMs),
  };
}

export const deferAfterResponse: Defer = (task) =>
  after(() =>
    task().catch((e) => {
      console.error("[meetings] deferred task:", e instanceof Error ? e.message : e);
    })
  );
