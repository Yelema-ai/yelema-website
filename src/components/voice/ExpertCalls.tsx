"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, PhoneCall, RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { callDuration, type CallRecord } from "@/lib/voice";
import { Button } from "@/components/ui/button";
import { CallButton } from "./CallButton";

// The "Appels" tab of an expert: the member's calls with it, newest first, each with the subject the
// expert wrote once the call was over. A subject still being written is read again shortly.

const PENDING_POLL_MS = 15_000;

const when = (iso: string) => {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? "" : at.toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

export function ExpertCalls({ expert }: { expert: { key: string; name: string; photoUrl: string | null } }) {
  const [calls, setCalls] = useState<CallRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch<{ items: CallRecord[] }>(`/api/voice/calls?expert=${encodeURIComponent(expert.key)}`);
      setCalls(r.items);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [expert.key]);

  useEffect(() => {
    void load();
  }, [load]);

  const pending = calls?.some((c) => c.subjectPending || c.status === "open") ?? false;
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => void load(), PENDING_POLL_MS);
    return () => clearInterval(t);
  }, [pending, load]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-bold text-ink">Appels avec {expert.name}</h2>
        <Button variant="ghost" size="sm" onClick={() => void load()} aria-label="Actualiser">
          <RefreshCw />
        </Button>
        <CallButton expert={expert} />
      </div>

      {error && <p className="text-sm text-ko">{error}</p>}
      {!calls && !error && (
        <p className="flex items-center gap-2 text-sm text-ink-3">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
        </p>
      )}
      {calls?.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line px-6 py-10 text-center">
          <PhoneCall className="h-6 w-6 text-ink-3" />
          <p className="text-sm text-ink-2">Aucun appel avec {expert.name} pour l’instant.</p>
        </div>
      )}
      {calls && calls.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {calls.map((c) => (
            <li key={c.id} className="flex items-start gap-3 px-4 py-3">
              <PhoneCall className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">
                  {c.subject ?? (c.status === "open" ? "Appel en cours" : c.subjectPending ? "Sujet en cours de rédaction…" : c.status === "failed" ? "Appel interrompu" : "Sans sujet")}
                </p>
                <p className="text-[12px] text-ink-3">
                  {when(c.startedAt)}
                  {c.durationSeconds != null && ` · ${callDuration(c.durationSeconds)}`}
                  {c.language === "en" && " · en anglais"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
