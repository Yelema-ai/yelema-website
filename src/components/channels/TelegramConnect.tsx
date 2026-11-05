"use client";

import { usePoll, WAIT_POLL_MS } from "@/components/usePoll";
import { useRef, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import {
  isChannelConnected,
  type MessagingPlatform,
  type TelegramBotCheck,
  type TelegramOwner,
} from "@/lib/channels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChannelPanelHeader } from "@/components/channels/ChannelCredentialsForm";
import { TelegramChannel } from "@/components/channels/TelegramChannel";
import { TelegramQrConnect } from "@/components/channels/TelegramQrConnect";
import { useAsyncAction } from "@/components/useAsyncAction";
import { DisconnectButton } from "@/components/channels/DisconnectButton";


type Step = "qr" | "token" | "owner" | "connected";

// Telegram is the channel worth building a real flow for: nobody has to install anything.
//
// By default a QR creates the bot (TelegramQrConnect). Pasting a BotFather token stays available, in
// three steps, and the middle one is the point: the first person to message the bot becomes its whole
// allowlist. Without that, anyone who guessed the bot's @username could talk to someone else's agent.
// We read that person from Telegram's own inbox rather than asking for a numeric user id nobody knows.
export function TelegramConnect({
  agentId,
  agentName,
  channel,
  onBack,
}: {
  agentId: string;
  agentName?: string | null;
  channel: MessagingPlatform;
  onBack: () => void;
}) {
  // Onglet « Mon propre bot » : jeton BotFather d'abord, QR en alternative.
  const [step, setStep] = useState<Step>(isChannelConnected(channel) ? "connected" : "token");
  const [qrBot, setQrBot] = useState<string | null>(null);
  const defaultBotName = (agentName ?? "").split("@")[0]?.trim() || "Mon assistant";
  const [token, setToken] = useState("");
  const [bot, setBot] = useState<TelegramBotCheck | null>(null);
  const [owner, setOwner] = useState<TelegramOwner | null>(null);
  // Telegram refuses to hand over the inbox once the bot is on a webhook, which is what a bot that is
  // already wired to an agent looks like. Then there is nobody to wait for: offer to connect as-is.
  const [ownerUnavailable, setOwnerUnavailable] = useState(false);
  const { busy, run } = useAsyncAction();
  // Bumped when this flow changes the bot the instance listens to.
  const [revision, setRevision] = useState(0);
  const connecting = useRef(false);

  const post = <T,>(body: Record<string, unknown>) =>
    apiFetch<T>(`/api/agents/${agentId}/channels/telegram`, { method: "POST", body: JSON.stringify(body) });

  const check = () =>
    run(async () => {
      const checked = await post<TelegramBotCheck>({ action: "check", token });
      setBot(checked);
      setOwner(null);
      setOwnerUnavailable(false);
      setStep("owner");
    });

  // Write the token (and whoever said hello) into the agent, then let the harness restart its gateway.
  const connect = (allowed: TelegramOwner) =>
    run(async () => {
      await apiFetch(`/api/agents/${agentId}/channels/telegram`, {
        method: "PUT",
        body: JSON.stringify({
          enabled: true,
          env: {
            TELEGRAM_BOT_TOKEN: token,
            TELEGRAM_ALLOWED_USERS: allowed.user_id,
          },
        }),
      });
      setStep("connected");
      setRevision((r) => r + 1);
      toast.success("Telegram connecté");
    });

  // Watch the bot's inbox while the screen asks its owner to say hello. The first message connects the
  // agent on its own, so there is no button to press after Telegram.
  // A miss is normal here (Telegram rate limits, a slow network): the wait goes on rather than throwing
  // the user back to the token field.
  usePoll(
    async () => {
      const result = await post<{ owner: TelegramOwner | null; unavailable: boolean }>({ action: "owner", token });
      if (result.unavailable) return setOwnerUnavailable(true);
      if (!result.owner) return;
      setOwner(result.owner);
      if (connecting.current) return;
      connecting.current = true;
      void connect(result.owner);
    },
    { enabled: step === "owner" && Boolean(bot) && !owner && !ownerUnavailable, everyMs: WAIT_POLL_MS, immediate: false, runOnShow: true, wake: { types: ["job.done"], kind: "telegram" } }
  );

  const disconnect = () =>
    run(async () => {
      await apiFetch(`/api/agents/${agentId}/channels/telegram`, { method: "DELETE" });
      toast.success("Telegram déconnecté");
      onBack();
    });

  // `yelemaActive` : le bot Yelema sert l'instance (le canal Hermes paraît alors « connecté ») ; ce parcours
  // repart du jeton, et connecter ici remplacera ce bot.
  const legacy = (yelemaActive: boolean) => {
    const view: Step = step === "connected" && yelemaActive ? "token" : step;
    return (
      <div className="space-y-5">
        {yelemaActive && <p className="text-xs text-muted-foreground">Vos Experts utilisent aujourd’hui le bot Yelema : connecter votre bot ici le remplacera.</p>}
        {view === "qr" && (
          <div className="space-y-4">
            <TelegramQrConnect
              agentId={agentId}
              defaultBotName={defaultBotName}
              onConnected={(username) => {
                setQrBot(username);
                setStep("connected");
              }}
            />
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setStep("token")}>
                J’ai déjà un bot (coller son jeton)
              </Button>
              {channel.configured && !yelemaActive && (
                <DisconnectButton name="Telegram" onConfirm={disconnect} disabled={busy} />
              )}
            </div>
          </div>
        )}

        {view === "token" && (
          <div className="space-y-4">
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
              <li>
                Ouvrez{" "}
                <a
                  href="https://t.me/BotFather"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  @BotFather
                </a>{" "}
                dans Telegram et envoyez <span className="font-medium text-foreground">/newbot</span>.
              </li>
              <li>Choisissez un nom et un nom d’utilisateur pour votre bot.</li>
              <li>Collez le jeton que BotFather vous envoie.</li>
            </ol>
            <div className="space-y-1.5">
              <Label htmlFor="telegram-token" className="text-xs">
                Jeton du bot
              </Label>
              <Input
                id="telegram-token"
                type="password"
                autoComplete="off"
                placeholder="123456789:AA..."
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={check} disabled={busy || token.trim().length === 0}>
                {busy ? <Loader2 className="animate-spin" /> : null}
                Continuer
              </Button>
              <Button variant="ghost" onClick={() => setStep("qr")} disabled={busy}>
                Utiliser plutôt un QR code
              </Button>
              {channel.configured && !yelemaActive && (
                <DisconnectButton name="Telegram" onConfirm={disconnect} disabled={busy} />
              )}
            </div>
          </div>
        )}

        {view === "owner" && bot && (
          <div className="space-y-4">
            <p className="text-sm">
              Ouvrez <span className="font-medium">@{bot.username}</span> et envoyez-lui un message. La première personne
              qui lui écrit est la seule à qui vos Experts répondront en privé ; dans le groupe des Experts, tous ses
              membres pourront leur écrire.
            </p>
            <div className="flex items-center gap-2">
              <Button asChild variant="outline">
                <a href={`https://t.me/${bot.username}`} target="_blank" rel="noopener noreferrer">
                  Ouvrir @{bot.username}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
            </div>
            {ownerUnavailable ? (
              <p className="text-xs text-muted-foreground">
                Ce bot est déjà relié à un autre service : Telegram ne nous indique pas à qui il appartient, et vos Experts
                ne répondent qu’à une personne connue. Détachez-le de cet autre service, ou créez un nouveau bot.
              </p>
            ) : (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                En attente de votre message
              </p>
            )}
          </div>
        )}

        {view === "connected" && (
          <div className="space-y-4">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {bot ? `@${bot.username} est connecté.` : qrBot ? `@${qrBot} est connecté.` : "Telegram est connecté."}
                </p>
                <p className="text-xs text-muted-foreground">
                  Écrivez au bot depuis Telegram : vos Experts vous répondent au même endroit.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {(bot || qrBot) && (
                <Button asChild>
                  <a href={`https://t.me/${bot?.username ?? qrBot}`} target="_blank" rel="noopener noreferrer">
                    Ouvrir la conversation
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => {
                  connecting.current = false;
                  setToken("");
                  setBot(null);
                  setOwner(null);
                  setQrBot(null);
                  setStep("token");
                }}
              >
                Connecter un autre bot
              </Button>
              <DisconnectButton name="Telegram" onConfirm={disconnect} disabled={busy} />
            </div>
            {owner?.name && <p className="text-xs text-muted-foreground">En privé, répond uniquement à {owner.name}.</p>}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <ChannelPanelHeader channel={channel} onBack={onBack} />
      <TelegramChannel
        agentId={agentId}
        canManage
        legacyConnected={step === "connected"}
        legacyRevision={revision}
        legacy={legacy}
        onDisconnectLegacy={disconnect}
      />
    </div>
  );
}
