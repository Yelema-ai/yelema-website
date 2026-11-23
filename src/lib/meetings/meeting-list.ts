import "server-only";
import { runPool } from "@/lib/bulk";
import type { Defer } from "./defer";
import { READ_CONCURRENCY, meetingsRoot, type MeetingScope } from "./drive";
import { meetingTitle } from "./labels";
import { logFailure } from "./log";
import { SCHEDULED_QUIET_MS, type Advance } from "./meeting-lifecycle";
import { preparePage, readBudget, type PublishBudget } from "./meeting-page";
import { meetingIds, minutesOf, storedMeeting } from "./meeting-store";
import { settleDelivery } from "./minutes-delivery";
import { isMeetingId, meetingIdAt } from "./record";
import { meetingView, type MeetingPage, type MeetingView } from "./view";

export interface PageRequest {
  before: string | null;
  query: string | null;
}

const FIRST_PAGE: PageRequest = { before: null, query: null };
const PAGE_SIZE = 30;
const SEARCH_SCAN = 150;
const QUERY_MAX = 100;

const folded = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function parsePageRequest(params: URLSearchParams): PageRequest | null {
  const before = params.get("before");
  if (before !== null && !isMeetingId(before)) return null;
  const query = params.get("q")?.trim().slice(0, QUERY_MAX) || null;
  return { before, query };
}

async function peekOf(scope: MeetingScope, root: string, id: string): Promise<MeetingView | null> {
  const found = await storedMeeting(scope, root, id);
  if (!found) return null;
  const minutes = found.record.phase === "writing" ? minutesOf(scope, found.folder, found.minutesText) : null;
  return meetingView(found.record, minutes, Date.now());
}

async function views(ids: string[], read: (id: string) => Promise<MeetingView | null>, scope: MeetingScope): Promise<MeetingView[]> {
  const results = await runPool(ids, READ_CONCURRENCY, read);
  return results.flatMap((r, k) => {
    if (r.status === "fulfilled") return r.value ? [r.value] : [];
    logFailure(`read ${scope.agentId}/${ids[k]}`, r.reason);
    return [];
  });
}

export function createListing(advance: Advance) {
  async function viewOf(scope: MeetingScope, root: string, id: string, defer: Defer, budget: PublishBudget): Promise<MeetingView | null> {
    const found = await storedMeeting(scope, root, id);
    if (!found) return null;
    const { folder, record: stored, minutesText } = found;
    let record = await advance(scope, root, stored, defer).catch((e) => {
      logFailure(`advance ${scope.agentId}/${id}`, e);
      return stored;
    });
    const minutes = record.phase === "writing" ? minutesOf(scope, folder, minutesText) : null;
    if (minutes) {
      const current = record;
      record = await settleDelivery(scope, folder, current).catch((e) => {
        logFailure(`settle ${scope.agentId}/${id}`, e);
        return current;
      });
      const settled = record;
      record = await preparePage(scope, folder, settled, minutes, defer, budget).catch((e) => {
        logFailure(`page ${scope.agentId}/${id}`, e);
        return settled;
      });
    }
    return meetingView(record, minutes, Date.now());
  }

  async function list(scope: MeetingScope, defer: Defer, page: PageRequest = FIRST_PAGE): Promise<MeetingPage> {
    const root = await meetingsRoot(scope);
    const before = page.before;
    const horizon = meetingIdAt(new Date(Date.now() + SCHEDULED_QUIET_MS));
    const ids = (await meetingIds(scope, root)).filter((id) => id <= horizon && (before === null || id < before));
    if (!page.query) {
      const slice = ids.slice(0, PAGE_SIZE);
      const budget = readBudget();
      return { items: await views(slice, (id) => viewOf(scope, root, id, defer, budget), scope), next: ids.length > slice.length ? slice[slice.length - 1] : null };
    }
    const wanted = folded(page.query);
    const items: MeetingView[] = [];
    let scanned = 0;
    while (scanned < ids.length && scanned < SEARCH_SCAN && items.length < PAGE_SIZE) {
      const chunk = ids.slice(scanned, scanned + READ_CONCURRENCY * 2);
      scanned += chunk.length;
      items.push(...(await views(chunk, (id) => peekOf(scope, root, id), scope)).filter((v) => folded(meetingTitle(v)).includes(wanted)));
    }
    return { items, next: scanned < ids.length ? ids[scanned - 1] : null };
  }

  return { list };
}
