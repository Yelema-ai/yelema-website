import "server-only";
import { meetstreamBots } from "@/lib/meetstream/client";
import { createAgendaSync } from "./agenda-sync";
import type { MeetingBots } from "./bots";
import type { Defer } from "./defer";
import type { MeetingScope } from "./drive";
import type { MeetingRequester } from "./expert-turns";
import { createLifecycle } from "./meeting-lifecycle";
import { createListing } from "./meeting-list";
import { sendMinutes, sendOptions } from "./minutes-delivery";

export type { AgendaPorts } from "./agenda-sync";
export type { Defer } from "./defer";
export type { MeetingRequester } from "./expert-turns";
export { parsePageRequest, type PageRequest } from "./meeting-list";
export type { SendPorts } from "./minutes-delivery";

export function createMeetings(bots: MeetingBots) {
  const lifecycle = createLifecycle(bots);
  const listing = createListing(lifecycle.advance);
  const agendaSync = createAgendaSync(bots);

  const start = (scope: MeetingScope, rawLink: unknown, requester: MeetingRequester, defer: Defer) =>
    lifecycle.start(scope, rawLink, requester, async () => (await listing.list(scope, defer)).items);

  return {
    list: listing.list,
    start,
    send: sendMinutes,
    sendOptions,
    rewrite: lifecycle.rewrite,
    onBotEvent: lifecycle.onBotEvent,
    ...agendaSync,
  };
}

export const meetings = createMeetings(meetstreamBots);
