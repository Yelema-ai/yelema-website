"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { DisconnectButton } from "@/components/channels/DisconnectButton";
import { TelegramHub } from "@/components/channels/TelegramHub";
import { useTelegramHub, type TelegramHubApi } from "@/components/channels/useTelegramHub";

type Mode = "yelema" | "own";
const TAB = "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all";

// Telegram of an instance, two ways side by side and always reachable: the Yelema bot (default, created in one
// tap) or the member's own BotFather bot, which the gateway prepares the same way (group, topics, home channel,
// routes) on Hermes and Claude Code. The historic flow (`legacy`) only serves an instance without a gateway.
// An instance listens to one bot: the line on top says which.
export function TelegramChannel({ agentId, canManage, legacy, legacyConnected = false, legacyRevision = 0, onDisconnectLegacy }: { agentId: string; canManage: boolean; legacy?: (yelemaActive: boolean) => React.ReactNode; legacyConnected?: boolean; legacyRevision?: number; onDisconnectLegacy?: () => Promise<void> }) {
  const hub = useTelegramHub(agentId);
  const [mode, setMode] = useState<Mode | null>(null);
  const loaded = hub.status !== null || hub.unavailable;
  // The historic flow just changed the bot the instance listens to: the gateway's view is re-read, now and
  // once its 15 s cache of that bot has passed.
  const { load } = hub;
  const seen = useRef(legacyRevision);
  useEffect(() => {
    if (seen.current === legacyRevision) return;
    seen.current = legacyRevision;
    void load();
    const t = setTimeout(() => void load(), 16_000);
    return () => clearTimeout(t);
  }, [legacyRevision, load]);
  const ownActive = hub.state?.source === "own" || (legacyConnected && !hub.state?.active);
  useEffect(() => {
    if (loaded && mode === null) setMode(ownActive ? "own" : "yelema");
  }, [loaded, mode, ownActive]);

  // No runtime gateway for this instance: only the historic flow exists.
  if (hub.unavailable) return <>{legacy?.(false)}</>;
  if (!loaded || mode === null) return <div className="h-24 animate-pulse rounded-lg border bg-card" />;

  const listened = hub.instanceBot;
  const listenedIsYelema = listened && hub.state?.botId === listened.id && hub.state.source !== "own";
  // A bot set outside the gateway (historic flow, by hand): only the instance's own channel can unplug it.
  const legacyBot = listened ? hub.state?.botId !== listened.id : legacyConnected && !hub.state;
  const tab = (m: Mode, label: string, active: boolean) => (
    <button type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={cn(TAB, mode === m ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink")}>
      {label}
      {active && <span className="ml-1.5 inline-block size-1.5 rounded-full bg-emerald-500 align-middle" aria-label="actif" />}
    </button>
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {listened ? (
          <>Vos Experts répondent sur Telegram avec <span className="font-semibold text-ink">@{listened.username ?? listened.id}</span> {listenedIsYelema ? ", le bot Yelema" : ", votre bot"}.</>
        ) : legacyConnected ? (
          "Vos Experts répondent sur Telegram avec votre bot."
        ) : (
          "Aucun bot Telegram ne sert encore vos Experts."
        )}
      </p>
      <div role="tablist" aria-label="Façon de connecter Telegram" className="inline-grid grid-cols-2 rounded-xl border border-line bg-soft p-1">
        {tab("yelema", "Bot Yelema", Boolean(listenedIsYelema))}
        {tab("own", "Mon propre bot", Boolean(listened ? !listenedIsYelema : legacyConnected))}
      </div>
      {mode === "yelema" ? (
        <TelegramHub hub={hub} source="yelema" canManage={canManage} />
      ) : (
        <div className="space-y-4">
          <TelegramHub hub={hub} source="own" canManage={canManage} />
          {canManage && legacyBot && onDisconnectLegacy && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
              <p className="text-sm">
                {listened ? <>Votre bot <span className="font-semibold">@{listened.username ?? listened.id}</span> sert vos Experts.</> : "Votre bot sert vos Experts."}
              </p>
              <DisconnectButton name="Telegram" onConfirm={onDisconnectLegacy} disabled={hub.busy !== null} />
            </div>
          )}
          {canManage && (hub.state?.source !== "own" || hub.state.phase === "failed") && <OwnToken hub={hub} />}
        </div>
      )}
    </div>
  );
}

// The member's BotFather bot, handed to the runtime gateway: it then prepares the group like the Yelema bot's.
// The token never stays in the browser past this field.
function OwnToken({ hub }: { hub: TelegramHubApi }) {
  const [token, setToken] = useState("");
  const listened = hub.instanceBot;
  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
        <li>
          Ouvrez{" "}
          <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="font-medium text-foreground underline-offset-4 hover:underline">@BotFather</a>{" "}
          dans Telegram et envoyez <span className="font-medium text-foreground">/newbot</span> (ou reprenez un bot existant).
        </li>
        <li>Choisissez un nom et un nom d’utilisateur pour votre bot.</li>
        <li>Collez le jeton que BotFather vous envoie : l’étape suivante ajoute le bot à votre groupe à Sujets, puis chaque Expert y reçoit son sujet.</li>
      </ol>
      <div className="space-y-1.5">
        <Label htmlFor="telegram-own-token" className="text-xs">Jeton du bot</Label>
        <Input id="telegram-own-token" type="password" autoComplete="off" placeholder="123456789:AA..." value={token} onChange={(e) => setToken(e.target.value)} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={async () => {
            if (await hub.own(token.trim())) setToken("");
          }}
          disabled={hub.busy !== null || token.trim().length === 0}
        >
          {hub.busy === "own" ? <Loader2 className="animate-spin" /> : null}
          Continuer
        </Button>
        {listened && <p className="text-xs text-muted-foreground">@{listened.username ?? listened.id} continue de répondre jusqu’à ce que le groupe du nouveau bot soit prêt.</p>}
      </div>
    </div>
  );
}
