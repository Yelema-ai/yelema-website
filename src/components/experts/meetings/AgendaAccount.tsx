"use client";

import Link from "next/link";
import { CalendarDays, Loader2 } from "lucide-react";
import type { AgendaView } from "@/lib/meetings/agenda";
import { Picker } from "@/components/ui/picker";

export function AgendaAccount({ view, error, busy, onChange }: { view: AgendaView | null; error: string | null; busy: boolean; onChange: (account: string) => void }) {
  const calendar = view?.calendars.find((c) => c.account === view.calendar);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-tint text-brand-ink">
        <CalendarDays className="size-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-medium text-ink-3">Agenda utilisé</span>
        {error ? (
          <span className="block text-[14px] text-ko">{error}</span>
        ) : !view ? (
          <span className="flex items-center gap-2 text-[14px] text-ink-3">
            <Loader2 className="size-4 animate-spin" /> Chargement…
          </span>
        ) : calendar ? (
          <span className="block truncate text-[15px] font-semibold text-ink">{calendar.email ?? calendar.label}</span>
        ) : (
          <span className="block text-[14px] font-semibold text-ink">Aucun agenda connecté</span>
        )}
      </span>
      {view && view.calendars.length > 1 && (
        <Picker
          label="Changer d’agenda"
          value={view.calendar ?? ""}
          onChange={(account) => !busy && onChange(account)}
          groups={[{ options: view.calendars.map((c) => ({ value: c.account, label: c.email ?? c.label })) }]}
          placeholder="Choisir un agenda"
          className="max-w-[15rem]"
        />
      )}
      {view && !view.calendar && (
        <Link href="/integrations/connecteurs" className="inline-flex h-9 items-center rounded-full bg-brand px-4 text-[13px] font-semibold text-on-brand hover:opacity-90">
          Connecter Google Agenda ou Outlook
        </Link>
      )}
    </div>
  );
}
