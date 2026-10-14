"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Sparkles,
  X,
  Send,
  Users,
  Plug,
  Receipt,
  Repeat,
  LayoutDashboard,
  Bug,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useExpertsContext } from "@/components/experts/ExpertsProvider";
import { useChat } from "@/components/chat/useChat";
import { Markdown } from "@/components/chat/Markdown";
import { cn } from "@/lib/utils";

const YELE_SHORTCUTS = [
  {
    id: "recruter",
    label: "Recruter un Expert",
    desc: "Trouver et cadrer un profil IA",
    prompt: "Je voudrais recruter un nouvel Expert.",
    icon: Users,
    color: "from-blue-500/10 to-indigo-500/10 text-blue-600 dark:text-blue-400",
  },
  {
    id: "outils",
    label: "Connecter mes outils",
    desc: "Google Drive, Telegram, etc.",
    prompt: "Je voudrais connecter les outils de mon entreprise à mes Experts.",
    icon: Plug,
    color: "from-amber-500/10 to-orange-500/10 text-amber-600 dark:text-amber-400",
  },
  {
    id: "facture",
    label: "Ma facture",
    desc: "Consommation et forfait",
    prompt: "Je voudrais voir ma facture et ma consommation.",
    icon: Receipt,
    color: "from-emerald-500/10 to-teal-500/10 text-emerald-600 dark:text-emerald-400",
  },
  {
    id: "routine",
    label: "Créer une routine",
    desc: "Tâche récurrente automatisée",
    prompt: "Je voudrais qu'un Expert fasse une tâche régulièrement pour moi.",
    icon: Repeat,
    color: "from-purple-500/10 to-violet-500/10 text-purple-600 dark:text-purple-400",
  },
  {
    id: "tableau",
    label: "E-mails & livrables",
    desc: "Messagerie des experts",
    prompt: "Comment mes Experts peuvent-ils envoyer des e-mails ou des livrables ?",
    icon: LayoutDashboard,
    color: "from-pink-500/10 to-rose-500/10 text-pink-600 dark:text-pink-400",
  },
  {
    id: "bug",
    label: "Signaler un problème",
    desc: "Diagnostic & support technique",
    prompt: "J'ai besoin d'aide ou je rencontre un problème technique sur Yelema.",
    icon: Bug,
    color: "from-red-500/10 to-rose-500/10 text-red-600 dark:text-red-400",
  },
];

export function YeleBubble() {
  const { experts } = useExpertsContext();
  const agentId = experts[0]?.agentId;

  // Détection dynamique du profil compagnon s'il est déployé, sinon accueil par défaut de l'instance
  const companionProfile = useMemo(() => {
    const found = experts.find((e) => e.profileId === "yele" || e.catalogueKey === "yele");
    return found ? found.profileId : null;
  }, [experts]);

  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Restauration de session sauvegardée
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = window.sessionStorage.getItem("yele_session_id");
      if (saved) setSessionId(saved);
    }
  }, []);

  const handleSessionCreated = (newId: string) => {
    setSessionId(newId);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("yele_session_id", newId);
    }
  };

  const { messages, isStreaming, error, send } = useChat({
    agentId: agentId ?? "",
    profile: companionProfile,
    sessionId,
    onSessionCreated: handleSessionCreated,
  });

  // Défilement automatique vers les derniers messages
  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isStreaming, open]);

  if (!agentId) return null;

  const handleSubmit = (e?: FormEvent) => {
    if (e) e.preventDefault();
    const clean = input.trim();
    if (!clean || isStreaming) return;
    setInput("");
    send(clean, {});
  };

  const handleShortcut = (promptText: string) => {
    send(promptText, {});
  };

  const handleNewChat = () => {
    setSessionId(null);
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem("yele_session_id");
    }
  };

  return (
    <>
      {/* Bouton Flottant Yélé */}
      <div className="fixed bottom-6 right-6 z-50">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className={cn(
            "group relative flex items-center gap-2.5 rounded-full border border-line/60 bg-surface/95 p-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.16)] backdrop-blur-md transition-all hover:scale-105 active:scale-95",
            open ? "ring-2 ring-brand/50" : "hover:border-brand/40"
          )}
          aria-label={open ? "Fermer Yélé" : "Ouvrir l'assistant Yélé"}
        >
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/experts/yele.jpg"
              alt="Yélé"
              className="size-10 rounded-full object-cover ring-2 ring-brand/30 shadow-xs"
            />
            <span className="absolute bottom-0 right-0 size-3 rounded-full bg-emerald-500 ring-2 ring-surface" />
          </div>

          {!open && (
            <div className="hidden sm:flex items-center gap-1.5 pr-3 text-xs font-semibold text-ink">
              <span>Yélé</span>
              <span className="rounded-full bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand">
                Aide
              </span>
            </div>
          )}
        </button>
      </div>

      {/* Volet Flottant / Drawer */}
      {open && (
        <div
          className="fixed bottom-20 right-4 sm:right-6 z-50 flex h-[580px] max-h-[85vh] w-[calc(100vw-32px)] max-w-[420px] flex-col overflow-hidden rounded-[26px] border border-line bg-surface/98 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.22)] animate-in fade-in zoom-in-95 duration-200"
          role="dialog"
          aria-label="Assistant d'accompagnement Yélé"
        >
          {/* Header */}
          <div className="relative flex items-center justify-between border-b border-line bg-surface/80 px-4 py-3.5 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/experts/yele.jpg"
                  alt="Yélé"
                  className="size-10 rounded-full object-cover ring-2 ring-brand/40 shadow-xs"
                />
                <span className="absolute bottom-0 right-0 size-2.5 rounded-full bg-emerald-500 ring-2 ring-surface" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-ink">Yélé</h3>
                  <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold text-brand">
                    Accompagnement
                  </span>
                </div>
                <p className="text-[11px] text-ink-3">Conseils, onboarding & support Yelema</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={handleNewChat}
                  title="Nouvelle discussion"
                  className="grid size-8 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-soft hover:text-ink"
                >
                  <RefreshCw className="size-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                title="Réduire"
                className="grid size-8 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-soft hover:text-ink"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
            {messages.length === 0 ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-brand/20 bg-gradient-to-br from-brand/5 via-transparent to-brand/10 p-3.5 shadow-xs">
                  <div className="flex items-start gap-2.5">
                    <Sparkles className="size-5 shrink-0 text-brand mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-ink leading-relaxed">
                        Bonjour ! Je suis <span className="text-brand font-bold">Yélé</span>, votre employée IA
                        d’accompagnement.
                      </p>
                      <p className="mt-1 text-[11.5px] text-ink-3 leading-relaxed">
                        Je vous aide à tirer le meilleur parti de vos Experts, brancher vos outils, automatiser vos tâches
                        ou résoudre tout blocage.
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-3">
                    Actions rapides
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {YELE_SHORTCUTS.map((s) => {
                      const Icon = s.icon;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => handleShortcut(s.prompt)}
                          disabled={isStreaming}
                          className="flex flex-col items-start gap-1.5 rounded-xl border border-line bg-surface p-2.5 text-left transition-all hover:border-brand/30 hover:bg-soft hover:shadow-xs active:scale-[0.98] group"
                        >
                          <div className={cn("grid size-7 place-items-center rounded-lg bg-gradient-to-br", s.color)}>
                            <Icon className="size-4" />
                          </div>
                          <span className="text-[12px] font-semibold text-ink group-hover:text-brand line-clamp-1">
                            {s.label}
                          </span>
                          <span className="text-[10px] text-ink-3 line-clamp-1">{s.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((m) => {
                  const isUser = m.role === "user";
                  return (
                    <div
                      key={m.id}
                      className={cn("flex flex-col gap-1", isUser ? "items-end" : "items-start")}
                    >
                      <div
                        className={cn(
                          "max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-xs",
                          isUser
                            ? "bg-brand text-on-brand rounded-br-sm"
                            : "bg-soft border border-line text-ink rounded-bl-sm"
                        )}
                      >
                        {isUser ? (
                          <p className="whitespace-pre-wrap">{m.content}</p>
                        ) : (
                          <Markdown content={m.content} agentId={agentId} />
                        )}
                      </div>
                    </div>
                  );
                })}

                {isStreaming && (
                  <div className="flex items-center gap-2 text-ink-3 text-xs pl-1">
                    <Loader2 className="size-3.5 animate-spin text-brand" />
                    <span className="text-[11px]">Yélé rédige sa réponse…</span>
                  </div>
                )}

                {error && (
                  <div className="rounded-xl bg-ko-pale p-2.5 text-xs text-ko">
                    {error}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer Input */}
          <div className="border-t border-line bg-surface/90 p-3 backdrop-blur-sm">
            <form onSubmit={handleSubmit} className="relative flex items-center gap-1.5">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Posez une question à Yélé…"
                disabled={isStreaming}
                className="w-full rounded-xl border border-line bg-soft/70 px-3.5 py-2 text-xs text-ink placeholder:text-ink-3 outline-none transition-all focus:border-brand/40 focus:bg-surface focus:ring-2 focus:ring-brand/15"
              />
              <button
                type="submit"
                disabled={!input.trim() || isStreaming}
                aria-label="Envoyer"
                className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand text-on-brand transition-all hover:opacity-90 disabled:opacity-40 disabled:pointer-events-none active:scale-95"
              >
                {isStreaming ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
