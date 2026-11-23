"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { SendOptions, SendRequest } from "@/lib/meetings/audience";
import { isOngoing, type MeetingPage, type MeetingView } from "@/lib/meetings/view";
import { usePoll } from "@/components/usePoll";

const ONGOING_POLL_MS = 15_000;

const newestFirst = (a: MeetingView, b: MeetingView) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

const meetingsPath = (agentId: string) => `/api/agents/${encodeURIComponent(agentId)}/meetings`;

function merged(lists: MeetingView[][]): MeetingView[] {
  const byId = new Map<string, MeetingView>();
  for (const list of lists) for (const m of list) if (!byId.has(m.id)) byId.set(m.id, m);
  return [...byId.values()].sort(newestFirst);
}

export function useMeetings(agentId: string, profile: string) {
  const base = meetingsPath(agentId);
  const [head, setHead] = useState<MeetingView[] | null>(null);
  const [tail, setTail] = useState<MeetingView[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const paged = useRef(false);
  const shown = useRef<MeetingView[]>([]);

  const page = useCallback(
    (before: string | null, query: string | null) => {
      const params = new URLSearchParams({ profile });
      if (before) params.set("before", before);
      if (query) params.set("q", query);
      return apiFetch<MeetingPage>(`${base}?${params.toString()}`);
    },
    [base, profile]
  );

  const load = useCallback(async () => {
    try {
      const first = await page(null, null);
      if (paged.current) {
        const kept = new Set(first.items.map((m) => m.id));
        const pushedOut = shown.current.filter((m) => !kept.has(m.id));
        setTail((current) => merged([pushedOut, current]));
      } else {
        setNext(first.next);
      }
      shown.current = first.items;
      setHead(first.items);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  const more = useCallback(async () => {
    if (!next) return;
    const older = await page(next, null);
    paged.current = true;
    setTail((current) => [...current, ...older.items]);
    setNext(older.next);
  }, [page, next]);

  const items = useMemo(() => (head ? merged([head, tail]) : null), [head, tail]);
  const ongoing = items?.some((m) => isOngoing(m.status)) ?? false;
  usePoll(load, { everyMs: ONGOING_POLL_MS, immediate: false, enabled: ongoing });

  const keep = useCallback((view: MeetingView) => {
    setHead((current) => merged([[view], current ?? []]));
    setTail((current) => current.map((m) => (m.id === view.id ? view : m)));
    return view;
  }, []);

  const post = useCallback(
    (path: string, body: Record<string, unknown>) => apiFetch<MeetingView>(`${base}${path}`, { method: "POST", body: JSON.stringify({ profile, ...body }) }).then(keep),
    [base, profile, keep]
  );

  const sendOptions = useCallback(
    (id: string) => apiFetch<SendOptions>(`${base}/${encodeURIComponent(id)}/send?profile=${encodeURIComponent(profile)}`),
    [base, profile]
  );

  return {
    items,
    error,
    hasMore: next !== null,
    more,
    search: page,
    keep,
    reload: load,
    start: (link: string) => post("", { link }),
    sendOptions,
    send: (id: string, request: SendRequest) => post(`/${encodeURIComponent(id)}/send`, { ...request }),
    rewrite: (id: string) => post(`/${encodeURIComponent(id)}/minutes`, {}),
  };
}
