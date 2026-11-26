"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { DEFAULT_AGENDA, applyAgendaChange, autoKeys, isWanted, type AgendaChange, type AgendaItem, type AgendaToggle, type AgendaView } from "@/lib/meetings/agenda";

const settingsOf = (view: AgendaView) => ({ ...DEFAULT_AGENDA, mode: view.mode, chosen: view.chosen, skipped: view.skipped });

function applied(view: AgendaView, change: AgendaChange): AgendaView {
  const next = applyAgendaChange(settingsOf(view), change, [], autoKeys(view.events));
  return next ? { ...view, mode: next.mode, chosen: next.chosen, skipped: next.skipped } : view;
}

const wantedIn = (view: AgendaView | null, key: string): boolean =>
  !!view && isWanted(settingsOf(view), key, view.events.find((e) => e.key === key)?.pending ?? false);

const withItem = (view: AgendaView | null, item: AgendaItem): AgendaView | null =>
  view && { ...view, events: view.events.map((e) => (e.key === item.key ? item : e)) };

export function useAgenda(agentId: string, profile: string, onSynced: () => void) {
  const path = `/api/agents/${encodeURIComponent(agentId)}/meetings/agenda`;
  const [view, setView] = useState<AgendaView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settling, setSettling] = useState(false);
  const current = useRef<AgendaView | null>(null);
  const running = useRef(new Set<string>());

  const show = useCallback((next: AgendaView | null | ((v: AgendaView | null) => AgendaView | null)) => {
    const value = typeof next === "function" ? next(current.current) : next;
    current.current = value;
    setView(value);
  }, []);

  const read = useCallback(() => apiFetch<AgendaView>(`${path}?profile=${encodeURIComponent(profile)}`), [path, profile]);

  useEffect(() => {
    let live = true;
    read()
      .then((v) => {
        if (!live) return;
        show(v);
        setError(null);
        if (v.changed) onSynced();
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [read, onSynced, show]);

  const patch = useCallback(<T>(body: Record<string, unknown>) => apiFetch<T>(path, { method: "PATCH", body: JSON.stringify({ profile, ...body }) }), [path, profile]);

  const isOn = useCallback((key: string) => wantedIn(view, key), [view]);

  const toggle = useCallback(
    async (key: string) => {
      const on = !wantedIn(current.current, key);
      show((v) => v && applied(v, { event: key, on }));
      if (running.current.has(key)) return;
      running.current.add(key);
      try {
        for (;;) {
          const target = wantedIn(current.current, key);
          const result = await patch<AgendaToggle>({ event: key, on: target });
          show((v) => withItem(v, result.item));
          if (result.changed) onSynced();
          if (wantedIn(current.current, key) === target) return;
        }
      } catch (e) {
        void read().then(
          (v) => {
            show(v);
            if (v.changed) onSynced();
          },
          () => undefined
        );
        throw e;
      } finally {
        running.current.delete(key);
      }
    },
    [patch, read, onSynced, show]
  );

  const setAll = useCallback(
    async (all: boolean) => {
      const before = current.current;
      show((v) => v && applied(v, { mode: all ? "all" : "chosen" }));
      setSettling(true);
      try {
        const next = await patch<AgendaView>({ mode: all ? "all" : "chosen" });
        show(next);
        if (next.changed) onSynced();
      } catch (e) {
        show(before);
        throw e;
      } finally {
        setSettling(false);
      }
    },
    [patch, onSynced, show]
  );

  const setCalendar = useCallback(
    async (calendar: string) => {
      setSettling(true);
      try {
        const next = await patch<AgendaView>({ calendar });
        show(next);
        if (next.changed) onSynced();
      } finally {
        setSettling(false);
      }
    },
    [patch, onSynced, show]
  );

  return { view, error, settling, isOn, toggle, setAll, setCalendar };
}
