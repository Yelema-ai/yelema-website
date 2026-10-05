"use client";

import { useState } from "react";
import { Loader2, MessagesSquare } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { TelegramTopicsResult } from "@/lib/channels";
import { EXPERTS } from "@/config/experts";
import { Button } from "@/components/ui/button";
import { ExpertAvatar } from "@/components/app/ExpertAvatar";
import { Steps } from "@/components/channels/TelegramConnect";

// "Un sujet par expert": the Telegram bot joins a forum group, and each expert gets a topic of their
// own there, routed to their Hermes profile. The instance does the work (POST …/telegram/topics); the
// user only prepares the group. Safe to run again, e.g. after hiring an expert.
export function TelegramTopics({
  agentId,
  telegramConnected,
}: {
  agentId: string;
  // null while the channels are loading
  telegramConnected: boolean | null;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TelegramTopicsResult | null>(null);

  async function create() {
    setBusy(true);
    setResult(null);
    try {
      setResult(await apiFetch<TelegramTopicsResult>(`/api/agents/${agentId}/channels/telegram/topics`, { method: "POST" }));
    } catch (e) {
      setResult({ ok: false, message: (e as Error).message, output: "" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[22px] border border-line bg-surface p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-tint text-brand">
          <MessagesSquare className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-lg font-bold text-ink">Un sujet par expert</h3>
          <p className="mt-1 text-sm text-ink-3">
            Dans un groupe Telegram, chaque expert a son propre sujet : vous lui écrivez là, il vous répond au même
            endroit.
          </p>
        </div>
      </div>

      <div className="mt-4 flex -space-x-2" aria-hidden="true">
        {EXPERTS.map((e) => (
          <ExpertAvatar key={e.key} expertKey={e.key} size={30} className="ring-2 ring-surface" />
        ))}
      </div>

      <div className="mt-5 rounded-2xl bg-soft p-4">
        <Steps
          items={[
            <>
              Dans Telegram, créez un groupe (<span className="font-semibold text-ink">Nouveau groupe</span>) et
              ajoutez-y votre bot.
            </>,
            <>
              Ouvrez les paramètres du groupe : touchez son nom puis{" "}
              <span className="font-semibold text-ink">Modifier</span> sur téléphone, ou{" "}
              <span className="font-semibold text-ink">⋮</span> puis{" "}
              <span className="font-semibold text-ink">Gérer le groupe</span> sur ordinateur. Activez{" "}
              <span className="font-semibold text-ink">Sujets</span>.
            </>,
            <>
              Toujours dans les paramètres, ouvrez <span className="font-semibold text-ink">Administrateurs</span>,
              ajoutez votre bot et laissez-lui le droit <span className="font-semibold text-ink">Gérer les sujets</span>.
            </>,
            <>
              Depuis votre compte (celui qui a écrit au bot), envoyez{" "}
              <code className="rounded bg-surface px-1 font-mono text-[13px] text-ink">/sethome</code> dans le sujet{" "}
              <span className="font-semibold text-ink">Général</span> du groupe. Le bot répond pour confirmer.
            </>,
          ]}
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button onClick={create} disabled={busy || telegramConnected !== true}>
          {busy && <Loader2 className="animate-spin" />}
          {busy ? "Création des sujets…" : "Créer les sujets des experts"}
        </Button>
        <span className="text-[13px] text-ink-3">
          {telegramConnected === false
            ? "Connectez d’abord Telegram ci-dessus."
            : busy
              ? "Cela peut prendre une minute."
              : "Vous pouvez relancer à tout moment : les sujets déjà créés sont gardés."}
        </span>
      </div>

      {result && (
        <div
          role="status"
          className={cn("mt-4 rounded-xl px-4 py-3 text-sm", result.ok ? "bg-ok-pale text-ok" : "bg-ko-pale text-ko")}
        >
          <p className="font-semibold">{result.message}</p>
          {!result.ok && result.output && (
            <details className="mt-2 text-xs text-ink-2">
              <summary className="cursor-pointer select-none">Voir le détail</summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-surface p-3 font-mono text-[11px]">
                {result.output}
              </pre>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
