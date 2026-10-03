"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TelegramIcon } from "@/components/channels/BrandIcons";
import { useAsyncAction } from "@/components/useAsyncAction";

const OWNER_POLL_MS = 3000;

type Step = "token" | "owner" | "connected";

// Telegram on the business chat (the instance's default Hermes profile), shown in the Canaux dialog.
//
// Three steps, and the middle one is the point: the first person to message the bot becomes its whole
// allowlist. Without that, anyone who guessed the bot's @username could talk to the company's experts.
// We read that person from Telegram's own inbox rather than asking for a numeric user id nobody knows.
export function TelegramConnect({
  agentId,
  channel,
  onChanged,
  onClose,
}: {
  agentId: string;
  channel: MessagingPlatform;
  onChanged: () => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>(isChannelConnected(channel) ? "connected" : "token");
  const [token, setToken] = useState("");
  const [bot, setBot] = useState<TelegramBotCheck | null>(null);
  const [owner, setOwner] = useState<TelegramOwner | null>(null);
  // Telegram refuses to hand over the inbox once the bot is on a webhook, which is what a bot that is
  // already wired somewhere looks like. Then there is nobody to wait for: offer to connect as-is.
  const [ownerUnavailable, setOwnerUnavailable] = useState(false);
  const { busy, run } = useAsyncAction();
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

  // Write the token (and whoever said hello) into the instance, then let Hermes restart its gateway.
  const connect = (allowed: TelegramOwner | null) =>
    run(async () => {
      try {
        await apiFetch(`/api/agents/${agentId}/channels/telegram`, {
          method: "PUT",
          body: JSON.stringify({
            enabled: true,
            env: {
              TELEGRAM_BOT_TOKEN: token,
              TELEGRAM_ALLOWED_USERS: allowed?.user_id ?? "",
            },
          }),
        });
      } finally {
        connecting.current = false;
      }
      setStep("connected");
      toast.success("Telegram est connecté");
      onChanged();
    });

  // Watch the bot's inbox while the screen asks its owner to say hello. The first message connects the
  // bot on its own, so there is no button to press after Telegram.
  useEffect(() => {
    if (step !== "owner" || !bot || owner || ownerUnavailable) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await post<{ owner: TelegramOwner | null; unavailable: boolean }>({ action: "owner", token });
        if (cancelled) return;
        if (result.unavailable) {
          setOwnerUnavailable(true);
          return;
        }
        if (result.owner) {
          setOwner(result.owner);
          if (!connecting.current) {
            connecting.current = true;
            void connect(result.owner);
          }
          return;
        }
      } catch {
        // A miss is normal here (Telegram rate limits, a slow network): keep waiting rather than
        // throwing the user back to the token field.
      }
      if (!cancelled) timer = setTimeout(() => void poll(), OWNER_POLL_MS);
    };

    timer = setTimeout(() => void poll(), OWNER_POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, bot, owner, ownerUnavailable, token]);

  const disconnect = () =>
    run(async () => {
      await apiFetch(`/api/agents/${agentId}/channels/telegram`, { method: "DELETE" });
      toast.success("Telegram est déconnecté");
      onClose();
    });

  const restart = () => {
    connecting.current = false;
    setToken("");
    setBot(null);
    setOwner(null);
    setOwnerUnavailable(false);
    setStep("token");
  };

  return (
    <div className="space-y-5">
      <DialogHeader className="flex-row items-center gap-3 space-y-0 text-left">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-soft">
          <TelegramIcon className="h-6 w-6" style={{ color: "#26A5E4" }} />
        </span>
        <div className="min-w-0 space-y-1">
          <DialogTitle className="font-display text-xl font-bold text-ink">Telegram</DialogTitle>
          <DialogDescription className="text-[13px] text-ink-3">Un bot Telegram relié au chat entreprise.</DialogDescription>
        </div>
      </DialogHeader>

      {step === "token" && (
        <div className="space-y-4">
          <Steps
            items={[
              <>
                Ouvrez{" "}
                <a
                  href="https://t.me/BotFather"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-link underline-offset-4 hover:underline"
                >
                  @BotFather
                </a>{" "}
                dans Telegram et envoyez <code className="rounded bg-soft px-1 font-mono text-[13px] text-ink">/newbot</code>.
              </>,
              <>Choisissez un nom et un identifiant pour le bot.</>,
              <>Collez ici le jeton que BotFather vous envoie.</>,
            ]}
          />
          <div className="space-y-2">
            <Label htmlFor="telegram-token">Jeton du bot</Label>
            <Input
              id="telegram-token"
              type="password"
              autoComplete="off"
              placeholder="123456789:AA…"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && token.trim() && !busy) void check();
              }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={check} disabled={busy || token.trim().length === 0}>
              {busy && <Loader2 className="animate-spin" />}
              Continuer
            </Button>
            {channel.configured && (
              <Button variant="ghost" className="text-ko hover:text-ko" onClick={disconnect} disabled={busy}>
                Déconnecter
              </Button>
            )}
          </div>
        </div>
      )}

      {step === "owner" && bot && (
        <div className="space-y-4">
          <p className="text-sm text-ink-2">
            Ouvrez <span className="font-semibold text-ink">@{bot.username}</span> et envoyez-lui un message. La
            première personne qui écrit sera la seule à qui vos experts répondent.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline">
              <a href={`https://t.me/${bot.username}`} target="_blank" rel="noopener noreferrer">
                Ouvrir @{bot.username}
                <ExternalLink />
              </a>
            </Button>
            {/* After a failed write the owner is already known: retry with them, never without. */}
            <Button variant="ghost" onClick={() => connect(owner)} disabled={busy}>
              {owner ? "Réessayer" : ownerUnavailable ? "Connecter quand même" : "Passer"}
            </Button>
          </div>
          {busy ? (
            <p className="flex items-center gap-2 text-[13px] text-ink-3">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {owner?.name ? `Message reçu de ${owner.name}. ` : ""}Connexion du bot, environ une minute.
            </p>
          ) : ownerUnavailable ? (
            <p className="rounded-xl bg-coral-pale px-3 py-2 text-[13px] text-coral-ink">
              Ce bot est déjà relié ailleurs : Telegram ne nous dit pas qui l’a créé. Une fois connecté, toute personne
              qui le trouve pourra lui écrire.
            </p>
          ) : (
            <p className="flex items-center gap-2 text-[13px] text-ink-3">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              En attente de votre message
            </p>
          )}
        </div>
      )}

      {step === "connected" && (
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-xl bg-ok-pale px-3.5 py-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-ok" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-ink">
                {bot ? `@${bot.username} est connecté.` : "Telegram est connecté."}
              </p>
              <p className="text-[13px] text-ink-2">
                Écrivez au bot depuis n’importe où : c’est le chat entreprise qui répond.
                {owner?.name ? ` Il ne répond qu’à ${owner.name}.` : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {bot && (
              <Button asChild>
                <a href={`https://t.me/${bot.username}`} target="_blank" rel="noopener noreferrer">
                  Ouvrir la conversation
                  <ExternalLink />
                </a>
              </Button>
            )}
            <Button variant="outline" onClick={restart} disabled={busy}>
              Changer de bot
            </Button>
            <Button variant="ghost" className="text-ko hover:text-ko" onClick={disconnect} disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              Déconnecter
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// A numbered how-to list, shared by the channel dialogs and the topics card.
export function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="space-y-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-sm text-ink-2">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-tint text-xs font-bold text-brand">
            {i + 1}
          </span>
          <span className="pt-0.5">{item}</span>
        </li>
      ))}
    </ol>
  );
}
