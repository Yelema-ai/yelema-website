"use client";

import { useEffect, useState } from "react";
import { Eye, Loader2, Lock, MessageSquarePlus } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Markdown } from "./Markdown";
import { toMs } from "@/lib/activity";

interface Shared {
  title: string;
  owner: string;
  expert: string;
  expiresAt: number;
  messages: { id: string; role: "user" | "assistant"; at: number; content: string }[];
}

const when = (at: number) =>
  new Date(toMs(at)).toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

// The page a shared conversation link opens: the thread as its owner sees it, read-only, with who
// shared it and until when the link works. No composer, no actions.
export function SharedConversation({ token }: { token: string }) {
  const [data, setData] = useState<Shared | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);

  // La conversation devient le début d'une conversation à soi, chez soi : rien n'est écrit chez le propriétaire.
  const resume = async () => {
    setResuming(true);
    setResumeError(null);
    try {
      const { href } = await apiFetch<{ href: string }>("/api/conversations/partagee/reprendre", { method: "POST", body: JSON.stringify({ c: token }) });
      window.location.href = href;
    } catch (e) {
      setResumeError((e as Error).message || "La conversation n’a pas pu être reprise.");
      setResuming(false);
    }
  };

  useEffect(() => {
    apiFetch<Shared>(`/api/conversations/partagee?c=${encodeURIComponent(token)}`)
      .then(setData)
      .catch((e) => setError((e as Error).message || "Cette conversation ne peut pas s’ouvrir."));
  }, [token]);

  return (
    <div className="min-h-dvh bg-bg text-ink">
      <header className="sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <a href="/" aria-label="Accueil" className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/yelema_y.svg" alt="Yelema" className="size-8" />
          </a>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-semibold">{data?.title ?? "Conversation partagée"}</h1>
            {data && (
              <p className="truncate text-[12.5px] text-ink-3">
                Avec {data.expert}
                {data.owner ? `, partagée par ${data.owner}` : ""}
              </p>
            )}
          </div>
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-soft px-3 py-1.5 text-[12px] font-semibold text-ink-2">
            <Eye className="size-3.5" aria-label="Lecture seule" /> <span className="hidden sm:inline">Lecture seule</span>
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-16 pt-6">
        {error ? (
          <div className="mx-auto mt-16 max-w-sm text-center">
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-soft text-ink-2">
              <Lock className="size-6" aria-hidden />
            </div>
            <p className="text-[15px] font-semibold">Conversation indisponible</p>
            <p className="mt-1 text-sm text-ink-3">{error}</p>
            <a href="/" className="mt-5 inline-block rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white">
              Revenir à l’accueil
            </a>
          </div>
        ) : !data ? (
          <div className="flex justify-center pt-24 text-ink-3">
            <Loader2 className="size-6 animate-spin" aria-label="Chargement" />
          </div>
        ) : (
          <>
            <ol className="flex flex-col gap-5">
              {data.messages.map((m) =>
                m.role === "user" ? (
                  <li key={m.id} className="flex flex-col items-end gap-1">
                    <span className="text-[11.5px] text-ink-3">
                      {data.owner || "Membre"}, {when(m.at)}
                    </span>
                    <div className="max-w-[min(85%,70ch)] whitespace-pre-wrap rounded-2xl rounded-br-md bg-brand px-4 py-2.5 text-[15px] text-white">{m.content}</div>
                  </li>
                ) : (
                  <li key={m.id} className="flex flex-col gap-1">
                    <span className="text-[11.5px] text-ink-3">
                      {data.expert}, {when(m.at)}
                    </span>
                    <div className="max-w-full">
                      <Markdown content={m.content} />
                    </div>
                  </li>
                )
              )}
            </ol>
            <div className="mt-10 flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => void resume()}
                disabled={resuming}
                className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {resuming ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <MessageSquarePlus className="size-4" aria-hidden />}
                Reprendre dans mon espace
              </button>
              <p className="text-[12px] text-ink-3">Une copie part chez vous ; la suite reste à vous, la conversation d’origine ne change pas.</p>
              {resumeError && <p className="text-[12.5px] text-destructive">{resumeError}</p>}
            </div>
            <p className="mt-6 text-center text-[12px] text-ink-3">
              Lien valable jusqu’au {new Date(data.expiresAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}. Powered by Yelema
            </p>
          </>
        )}
      </main>
    </div>
  );
}
