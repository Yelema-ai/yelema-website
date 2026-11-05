"use client";

import { useState } from "react";
import { Bot, Check, HelpCircle, MessageSquare, Send, Sparkles, TrendingUp, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface AskAnalystModalProps {
  isOpen: boolean;
  onClose: () => void;
  usedCredits: number;
  totalMessages: number;
  topAgentName: string;
}

export function AskAnalystModal({
  isOpen,
  onClose,
  usedCredits,
  totalMessages,
  topAgentName,
}: AskAnalystModalProps) {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<Array<{ sender: "user" | "analyst"; text: string }>>([
    {
      sender: "analyst",
      text: `Bonjour Christelle ! Je suis votre analyste IA dédié au studio Mstudio. Sur ce cycle, vous avez consommé ${usedCredits.toLocaleString("fr-FR")} crédits (~111,7M tokens) pour ${totalMessages} exécutions (${(usedCredits / Math.max(1, totalMessages)).toFixed(1)} crédits / run). L'expert ${topAgentName} est en tête avec 11% de l'usage. Comment puis-je vous éclairer sur la télémétrie de vos 12 experts ?`,
    },
  ]);

  if (!isOpen) return null;

  const handleSend = () => {
    if (!query.trim()) return;
    const userText = query.trim();
    setQuery("");

    setMessages((prev) => [...prev, { sender: "user", text: userText }]);

    setTimeout(() => {
      let reply = "D'après les données d'attribution de ce cycle :";
      if (userText.toLowerCase().includes("modèle") || userText.toLowerCase().includes("claude") || userText.toLowerCase().includes("hermes")) {
        reply = "Hermes (Claude 3.5 Sonnet) absorbe 70.6% des tokens (78,8M tokens sur 661 exécutions). Le modèle Claude Opus 5.5 est mobilisé pour les synthèses stratégiques et livrables denses (32,8M tokens sur 275 exécutions). L'allocation est parfaitement équilibrée.";
      } else if (userText.toLowerCase().includes("coût") || userText.toLowerCase().includes("crédit") || userText.toLowerCase().includes("optimis") || userText.toLowerCase().includes("trajectoire")) {
        reply = `Le ratio moyen est de ${(usedCredits / Math.max(1, totalMessages)).toFixed(1)} crédits par session. Les pics des 29 octobre et 3 novembre correspondent aux revues d'équipe et livrables stratégiques. Avec ~${usedCredits.toLocaleString("fr-FR")} crédits consommés sur un plafond de 250 000 crédits (~45%), la trajectoire du studio est parfaitement saine.`;
      } else {
        reply = `Koffi (Design & DA) et Djénéba (Chief of Staff) représentent ensemble 21% de la consommation totale (23,3M tokens), suivis d'Adjoua (Recrutement) et Mamadou (Comptabilité). Les outils Google Workspace (Gmail, Drive) et Exa AI cumulent plus de 820 appels.`;
      }

      setMessages((prev) => [...prev, { sender: "analyst", text: reply }]);
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in">
      <div className="relative w-full max-w-xl overflow-hidden rounded-[24px] border border-line bg-surface p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <Bot className="size-5" />
            </div>
            <div>
              <h3 className="font-display text-base font-bold text-ink">
                Analyste d'Espace & Consommation
              </h3>
              <p className="text-xs text-ink-3">
                Insights IA en direct sur la télémétrie Mstudio
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-ink-3 hover:bg-soft hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Conversation stream */}
        <div className="my-4 max-h-80 space-y-3 overflow-y-auto pr-1 text-xs">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={cn(
                "rounded-2xl p-3.5 leading-relaxed",
                m.sender === "user"
                  ? "ml-8 bg-brand text-brand-fg font-medium"
                  : "mr-8 bg-soft/70 text-ink border border-line/60"
              )}
            >
              {m.text}
            </div>
          ))}
        </div>

        {/* Suggestions chips */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {[
            "Quels sont les modèles les plus utilisés ?",
            "Trajectoire de fin de cycle ?",
            "Top agents consommateurs",
          ].map((suggestion, sIdx) => (
            <button
              key={sIdx}
              type="button"
              onClick={() => {
                setQuery(suggestion);
              }}
              className="rounded-full border border-line bg-soft/40 px-2.5 py-1 text-[11px] font-medium text-ink-3 hover:bg-soft hover:text-ink"
            >
              {suggestion}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="relative flex items-center">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSend();
            }}
            placeholder="Posez une question sur votre consommation..."
            className="w-full rounded-xl border border-line bg-soft/60 py-2.5 pl-4 pr-12 text-xs text-ink placeholder:text-ink-3 focus:border-brand/40 focus:bg-surface focus:outline-none"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!query.trim()}
            className="absolute right-2 flex size-7 items-center justify-center rounded-lg bg-brand text-brand-fg disabled:opacity-40"
          >
            <Send className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
