"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, RefreshCw, Mail } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  SUPPORTED_CHANNELS,
  channelError,
  channelStateLabel,
  isChannelConnected,
  type ChannelId,
  type ChannelsResponse,
  type MessagingPlatform,
} from "@/lib/channels";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { CHANNEL_BRANDS } from "@/components/channels/BrandIcons";
import { TelegramConnect } from "@/components/channels/TelegramConnect";
import { TelegramTopics } from "@/components/channels/TelegramTopics";
import { WhatsAppConnect } from "@/components/channels/WhatsAppConnect";

const CHANNEL_COPY: Record<ChannelId, { name: string; description: string }> = {
  telegram: {
    name: "Telegram",
    description: "Votre bot Telegram, relié au chat entreprise. Dans un groupe, chaque expert peut aussi avoir son sujet.",
  },
  whatsapp: {
    name: "WhatsApp",
    description: "Votre numéro WhatsApp, relié au chat entreprise : écrivez-lui dans la discussion avec vous-même.",
  },
};

// Paramètres > Canaux: reach the experts from Telegram or WhatsApp. Both channels live on the
// instance's default Hermes profile (the business chat); Telegram can also give each expert a forum
// topic. The live state comes from the instance itself (one exec), so the first load takes a moment.
export function ChannelsView({ agentId }: { agentId: string }) {
  const [channels, setChannels] = useState<MessagingPlatform[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<ChannelId | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { channels: list } = await apiFetch<ChannelsResponse>(`/api/agents/${agentId}/channels`);
      setChannels(list);
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const byId = (id: ChannelId) => channels?.find((c) => c.id === id) ?? null;
  const telegram = byId("telegram");
  const opened = open ? byId(open) : null;

  const close = () => {
    setOpen(null);
    void load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[15px] text-ink-2">Parlez à vos experts depuis votre téléphone, sur Telegram ou WhatsApp.</p>
          <p className="text-[13px] text-ink-3">
            Quand un canal est connecté, l’ordinateur de vos experts reste allumé pour répondre à toute heure.
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Actualiser" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={loading ? "animate-spin" : undefined} />
        </Button>
      </div>

      {loadError && channels === null ? (
        <div className="rounded-[22px] border border-line bg-surface p-6 text-center">
          <p className="text-sm text-ink-2">{loadError}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => void load()} disabled={loading}>
            Réessayer
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col rounded-[22px] border border-line bg-surface p-5">
            <div className="flex items-start justify-between gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-soft text-brand">
                <Mail className="h-6 w-6" />
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-ok-pale px-2.5 py-1 text-xs font-semibold text-ok">
                <Check className="h-3.5 w-3.5" />
                Connecté (AgentMail)
              </span>
            </div>
            <h3 className="mt-3 font-display text-lg font-bold text-ink">E-mail des experts</h3>
            <p className="mt-1 text-sm text-ink-3">
              Chaque expert dispose d'une adresse e-mail dédiée (@agentmail.to) pour recevoir des demandes externes et envoyer des livrables.
            </p>
            <div className="mt-auto pt-4">
              <Button asChild size="sm" variant="outline">
                <Link href="/experts/djeneba/fiche">Consulter les adresses</Link>
              </Button>
            </div>
          </div>
          {SUPPORTED_CHANNELS.map((id) => (
            <ChannelCard
              key={id}
              id={id}
              channel={channels === null ? undefined : byId(id)}
              onOpen={() => setOpen(id)}
            />
          ))}
        </div>
      )}

      <TelegramTopics
        agentId={agentId}
        telegramConnected={channels === null ? null : telegram ? isChannelConnected(telegram) : false}
      />

      <Dialog open={opened !== null} onOpenChange={(isOpen) => !isOpen && close()}>
        <DialogContent className="max-w-md">
          {opened?.id === "telegram" && (
            <TelegramConnect agentId={agentId} channel={opened} onChanged={() => void load()} onClose={close} />
          )}
          {opened?.id === "whatsapp" && (
            <WhatsAppConnect agentId={agentId} channel={opened} onChanged={() => void load()} onClose={close} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// `channel`: undefined while loading, null when the instance does not offer it.
function ChannelCard({
  id,
  channel,
  onOpen,
}: {
  id: ChannelId;
  channel: MessagingPlatform | null | undefined;
  onOpen: () => void;
}) {
  const { Icon, color } = CHANNEL_BRANDS[id];
  const copy = CHANNEL_COPY[id];
  const error = channel ? channelError(channel) : null;

  return (
    <div className="flex flex-col rounded-[22px] border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-soft">
          <Icon className="h-6 w-6" style={{ color }} />
        </span>
        {channel === undefined ? (
          <span className="h-6 w-24 animate-pulse rounded-full bg-soft" />
        ) : channel ? (
          <StatePill channel={channel} />
        ) : null}
      </div>
      <h3 className="mt-3 font-display text-lg font-bold text-ink">{copy.name}</h3>
      <p className="mt-1 text-sm text-ink-3">{copy.description}</p>
      {error && (
        <p className="mt-3 rounded-xl bg-ko-pale px-3 py-2 text-[13px] text-ko" title={error}>
          Ce canal ne répond plus. Ouvrez-le pour le reconnecter.
        </p>
      )}
      <div className="mt-auto pt-4">
        {channel === undefined ? (
          <span className="block h-8 w-28 animate-pulse rounded-[10px] bg-soft" />
        ) : channel === null ? (
          <p className="text-[13px] text-ink-3">Indisponible pour l’instant.</p>
        ) : channel.enabled ? (
          <Button variant="outline" size="sm" onClick={onOpen}>
            Gérer
          </Button>
        ) : (
          <Button size="sm" onClick={onOpen}>
            Connecter
          </Button>
        )}
      </div>
    </div>
  );
}

function StatePill({ channel }: { channel: MessagingPlatform }) {
  const connected = isChannelConnected(channel);
  const error = channelError(channel);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
        connected ? "bg-ok-pale text-ok" : error ? "bg-ko-pale text-ko" : "bg-soft text-ink-3"
      )}
    >
      {connected && <Check className="h-3.5 w-3.5" />}
      {channelStateLabel(channel)}
    </span>
  );
}
