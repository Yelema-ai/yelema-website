"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import {
  channelError,
  channelStateLabel,
  isChannelConnected,
  isFeaturedChannel,
  type ChannelsResponse,
  type MessagingPlatform,
} from "@/lib/channels";
import type { MergedAgent } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { channelBrand } from "@/components/channels/BrandIcons";
import { ChannelCredentialsForm } from "@/components/channels/ChannelCredentialsForm";
import { TelegramConnect } from "@/components/channels/TelegramConnect";
import { TelegramTopics } from "@/components/channels/TelegramTopics";
import { WhatsAppConnect } from "@/components/channels/WhatsAppConnect";

// The Messaging tab: connect this agent to the apps its owner already uses, so they can talk to it
// from their phone instead of only from this dashboard.
//
// The channel list is NOT hardcoded: it comes from the agent's own harness, which reports every
// channel it supports plus the credentials each one wants. Telegram and WhatsApp get a purpose-built
// panel (a bot to make, a QR to scan); everything else takes the generic credentials form built from
// what the harness asked for. Adding a channel is a harness release, not a change here.
export function ChannelsTab({
  agentId,
  agent,
  canManage,
}: {
  agentId: string;
  agent: MergedAgent;
  // Connecting a channel: the agent's owner.
  canManage: boolean;
}) {
  // Reaching the harness runs a command inside the instance, which wakes a sleeper but cannot start a
  // stopped agent.
  const reachable = agent.live_status === "running" || agent.live_status === "sleeping";

  const [channels, setChannels] = useState<MessagingPlatform[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      try {
        const { channels: list } = await apiFetch<ChannelsResponse>(`/api/agents/${agentId}/channels`);
        setChannels(list);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [agentId]
  );

  useEffect(() => {
    if (reachable) void load();
  }, [reachable, load]);

  if (!reachable) {
    return (
      <div className="space-y-6">
        <Header />
        <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          Start this agent to connect it to a messaging app.
        </p>
      </div>
    );
  }

  const open = channels?.find((c) => c.id === openId) ?? null;
  if (open) {
    const back = () => {
      setOpenId(null);
      void load(true);
    };
    return (
      <div className="space-y-6">
        {open.id === "telegram" ? (
          <TelegramConnect agentId={agentId} agentName={agent.name} channel={open} onBack={back} />
        ) : open.id === "whatsapp" ? (
          <WhatsAppConnect agentId={agentId} channel={open} onBack={back} />
        ) : (
          <ChannelCredentialsForm agentId={agentId} channel={open} onBack={back} />
        )}
      </div>
    );
  }

  const featured = (channels ?? []).filter((c) => isFeaturedChannel(c.id));
  const rest = (channels ?? []).filter((c) => !isFeaturedChannel(c.id));
  const connectedRest = rest.filter(isChannelConnected);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <Header />
        <Button variant="ghost" size="sm" disabled={loading} onClick={() => load()} aria-label="Refresh channels">
          <RefreshCw className={loading ? "animate-spin" : undefined} />
        </Button>
      </div>

      {channels === null ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="divide-y rounded-lg border bg-card">
            {featured.map((channel) => (
              <ChannelRow
                key={channel.id}
                channel={channel}
                canManage={canManage}
                onOpen={() => setOpenId(channel.id)}
              />
            ))}
            {connectedRest.map((channel) => (
              <ChannelRow
                key={channel.id}
                channel={channel}
                canManage={canManage}
                onOpen={() => setOpenId(channel.id)}
              />
            ))}
          </div>

          {/* One Telegram topic per expert, once the bot is connected. */}
          {canManage && (
            <TelegramTopics
              agentId={agentId}
              telegramConnected={(channels ?? []).some((c) => c.id === "telegram" && isChannelConnected(c))}
            />
          )}

          {rest.length > connectedRest.length && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                {showAll ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                More channels ({rest.length - connectedRest.length})
              </button>
              {showAll && (
                <div className="divide-y rounded-lg border bg-card">
                  {rest
                    .filter((c) => !isChannelConnected(c))
                    .map((channel) => (
                      <ChannelRow
                        key={channel.id}
                        channel={channel}
                        canManage={canManage}
                        onOpen={() => setOpenId(channel.id)}
                      />
                    ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Header() {
  return (
    <header className="space-y-1">
      <h2 className="text-lg font-semibold">Messaging apps</h2>
      <p className="text-sm text-muted-foreground">Message this agent from the apps you already use.</p>
    </header>
  );
}

function ChannelRow({
  channel,
  canManage,
  onOpen,
}: {
  channel: MessagingPlatform;
  canManage: boolean;
  onOpen: () => void;
}) {
  const { Icon, color } = channelBrand(channel.id);
  const connected = isChannelConnected(channel);
  const error = channelError(channel);
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-muted/20">
        <Icon className="h-4 w-4 shrink-0" {...(color ? { style: { color } } : {})} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{channel.name}</p>
          {connected && <Badge variant="success">Connected</Badge>}
          {!connected && error && <Badge variant="warning">Needs attention</Badge>}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {error || channel.description || channelStateLabel(channel)}
        </p>
      </div>
      <Button variant="outline" size="sm" disabled={!canManage} onClick={onOpen}>
        {connected ? "Manage" : isFeaturedChannel(channel.id) ? `Connect ${channel.name}` : "Connect"}
      </Button>
    </div>
  );
}
