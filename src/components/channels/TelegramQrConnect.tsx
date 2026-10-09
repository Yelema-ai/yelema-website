"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import type { TelegramPairingState } from "@/lib/channels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const POLL_MS = 2500;
const BOT_NAME_MAX = 64;

// Telegram without BotFather: the agent asks Telegram for a new bot, the user scans the QR (or opens
// the link on their phone) and confirms it in Telegram. That bot belongs to them, and the person who
// confirmed it becomes its only allowed user. The token never reaches this browser.
export function TelegramQrConnect({
  agentId,
  defaultBotName,
  onConnected,
}: {
  agentId: string;
  defaultBotName: string;
  onConnected: (botUsername: string | null) => void;
}) {
  const [botName, setBotName] = useState(defaultBotName.slice(0, BOT_NAME_MAX));
  const [session, setSession] = useState<TelegramPairingState | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = useRef(false);

  const pair = (body: Record<string, unknown>) =>
    apiFetch<TelegramPairingState>(`/api/agents/${agentId}/channels/telegram`, {
      method: "POST",
      body: JSON.stringify({ action: "pair", ...body }),
    });

  const start = async () => {
    setStarting(true);
    setError(null);
    done.current = false;
    try {
      setSession(await pair({ bot_name: botName.trim() }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "La connexion à Telegram est indisponible pour le moment.");
    } finally {
      setStarting(false);
    }
  };

  // Watch the pairing until the user confirms the bot in Telegram; that poll also saves it.
  useEffect(() => {
    if (!session || session.status !== "waiting") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await pair({ pairing_id: session.pairing_id });
        if (cancelled) return;
        if (next.status === "connected" && !done.current) {
          done.current = true;
          toast.success("Telegram connecté");
          onConnected(next.bot_username ?? null);
          return;
        }
        if (next.status === "expired") {
          setSession(null);
          setError("Ce code a expiré. Générez-en un nouveau.");
          return;
        }
      } catch (e) {
        if (cancelled) return;
        setSession(null);
        setError(e instanceof Error ? e.message : "La connexion à Telegram a échoué. Réessayez.");
        return;
      }
      if (!cancelled) timer = setTimeout(() => void poll(), POLL_MS);
    };
    timer = setTimeout(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.pairing_id, session?.status]);

  if (!session) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Nous créons un bot Telegram pour vos experts : scannez un code avec votre téléphone et confirmez dans
          Telegram. Pas de BotFather, aucun jeton à copier.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="telegram-bot-name" className="text-xs">
            Nom du bot
          </Label>
          <Input
            id="telegram-bot-name"
            maxLength={BOT_NAME_MAX}
            value={botName}
            onChange={(e) => setBotName(e.target.value)}
            placeholder="Mon assistant"
          />
        </div>
        {error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>
        )}
        <Button onClick={() => void start()} disabled={starting || botName.trim().length === 0}>
          {starting ? <Loader2 className="animate-spin" /> : null}
          Générer le QR code
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
        <li>Scannez ce code avec l’appareil photo de votre téléphone, ou ouvrez le lien sur le téléphone où Telegram est installé.</li>
        <li>Confirmez le nouveau bot dans Telegram{session.suggested_username ? ` (@${session.suggested_username})` : ""}.</li>
        <li>Revenez ici : la connexion se fait toute seule.</li>
      </ol>
      <div className="flex flex-col items-center gap-3">
        {session.qr_data_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={session.qr_data_url} alt="QR code de connexion à Telegram" className="h-56 w-56 rounded-md bg-white p-2" />
        ) : null}
        {session.deep_link ? (
          <Button asChild variant="outline">
            <a href={session.deep_link} target="_blank" rel="noopener noreferrer">
              Ouvrir dans Telegram
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
        ) : null}
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          En attente de votre confirmation dans Telegram
        </p>
      </div>
    </div>
  );
}
