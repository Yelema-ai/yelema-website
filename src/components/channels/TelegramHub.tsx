"use client";

import { useState } from "react";
import { AlertTriangle, Check, Copy, ExternalLink, Loader2, RefreshCw, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DisconnectButton } from "@/components/channels/DisconnectButton";
import { TelegramStartLink } from "@/components/channels/TelegramStartLink";
import { isTelegramLink, type TelegramHubApi } from "@/components/channels/useTelegramHub";

const WARN_ICON = "mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400";

// A Telegram the runtime gateway prepares: the bot (Yelema's, or the member's own for `source="own"`), a group
// with Topics, one topic per expert, then the bot handed to the instance. Every step can be cancelled; a failed
// one says why and resumes where it stopped; a bot the instance no longer listens to says so.
export function TelegramHub({ hub, source, canManage }: { hub: TelegramHubApi; source: "yelema" | "own"; canManage: boolean }) {
  const [copied, setCopied] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const s = hub.state && (hub.state.source ?? "yelema") === source ? hub.state : null;
  const other = hub.instanceBot && hub.instanceBot.id !== s?.botId ? hub.instanceBot : null;
  const busy = hub.busy !== null;

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!s) {
    if (source === "own") return null;
    return (
      <div className="space-y-3 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">Bot Yelema</p>
            <p className="text-xs text-muted-foreground">Votre propre bot, créé en un clic, et un groupe où chaque Expert a son sujet.</p>
          </div>
          {canManage && !hub.link && (
            <Button onClick={() => (other ? setConfirmReplace(true) : void hub.connect())} disabled={busy}>
              {hub.busy === "link" ? <><Loader2 className="animate-spin" />Ouverture…</> : "Connecter Telegram"}
            </Button>
          )}
        </div>
        {hub.link && (
          <TelegramStartLink url={hub.link.url} started={hub.link.started} since={hub.waitingSince} onCancel={() => void hub.stopWaiting()} busy={busy} />
        )}
        <ConfirmDialog
          open={confirmReplace}
          onOpenChange={setConfirmReplace}
          title="Remplacer le bot actuel ?"
          description={`Vos Experts répondent aujourd’hui via @${other?.username ?? "votre bot"}. Le bot Yelema prendra sa place dès que son groupe sera prêt ; d’ici là, rien ne change.`}
          confirmText="Continuer"
          onConfirm={async () => {
            await hub.connect();
          }}
        />
      </div>
    );
  }

  const topicCount = Object.keys(s.topics ?? {}).length;
  const botLink = (
    <a className="font-semibold text-brand hover:underline" href={`https://t.me/${s.bot}`} target="_blank" rel="noopener noreferrer">@{s.bot}</a>
  );

  if (s.phase === "failed") {
    return (
      <div className="space-y-3 rounded-lg border bg-card p-4">
        <p className="flex items-start gap-2 text-sm">
          <AlertTriangle className={WARN_ICON} />
          <span>La préparation de {botLink} s’est arrêtée{s.error ? <> : <span className="text-muted-foreground">{s.error}</span></> : "."}</span>
        </p>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            {source === "yelema" && (
              <Button variant="outline" size="sm" onClick={() => void hub.connect()} disabled={busy}>
                {hub.busy === "link" ? <Loader2 className="animate-spin" /> : <RotateCcw />}Reprendre
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => void hub.disconnect()} disabled={busy}>Annuler</Button>
          </div>
        )}
        {source === "own" && <p className="text-xs text-muted-foreground">Pour reprendre, collez à nouveau le jeton du bot ci-dessous.</p>}
      </div>
    );
  }

  if (s.phase !== "ready") {
    return (
      <div className="space-y-3 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm">Bot {botLink}{s.chatTitle ? <>, groupe « {s.chatTitle} »</> : null}</p>
          {canManage && <Button variant="ghost" size="sm" onClick={() => void hub.disconnect()} disabled={busy}>Annuler</Button>}
        </div>
        <ol className="list-decimal space-y-1.5 pl-5 text-xs text-muted-foreground">
          <li>Créez un groupe Telegram et activez-y les <span className="font-semibold">Sujets</span> (réglages du groupe).</li>
          <li>
            {isTelegramLink(s.groupUrl) ? (
              <a className="inline-flex items-center gap-1 font-semibold text-brand hover:underline" href={s.groupUrl} target="_blank" rel="noopener noreferrer">Ajouter le bot à mon groupe <ExternalLink className="h-3 w-3" /></a>
            ) : "Ajoutez le bot au groupe"}
            {" "}puis choisissez ce groupe.
          </li>
          {s.phase === "needs_topics" && <li className="font-semibold">Le bot est dans le groupe : activez maintenant les Sujets.</li>}
          <li><span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Chaque Expert reçoit son sujet dès que c’est fait.</span></li>
        </ol>
        {other && <p className="text-xs text-muted-foreground">D’ici là, vos Experts répondent toujours via @{other.username ?? "votre bot actuel"}.</p>}
      </div>
    );
  }

  // Connected: the group, the experts' topics, the colleagues to invite, then the way out.
  return (
    <div className="space-y-2 rounded-lg border bg-card p-4">
      {s.active === false && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border px-4 py-3">
          <p className="flex items-start gap-2 text-sm">
            <AlertTriangle className={WARN_ICON} />
            <span>Vos Experts n’écoutent plus @{s.bot}{other ? <> : ils répondent via @{other.username ?? "un autre bot"}</> : null}.</span>
          </p>
          {canManage && (
            <Button variant="outline" size="sm" onClick={() => void hub.sync()} disabled={busy}>
              {hub.busy === "sync" ? <Loader2 className="animate-spin" /> : <RotateCcw />}Le rétablir
            </Button>
          )}
        </div>
      )}
      <Block title="Votre groupe">
        <p className="text-sm text-ink-2">{s.chatTitle ? <>« {s.chatTitle} » avec </> : null}{botLink}</p>
      </Block>
      <Block
        title="Sujets des Experts"
        action={
          canManage && s.active !== false && (
            <Button variant="outline" size="sm" onClick={() => void hub.sync()} disabled={busy} className="max-sm:h-10">
              {hub.busy === "sync" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Mettre à jour
            </Button>
          )
        }
      >
        <p className="text-sm text-ink-2">{topicCount > 1 ? `${topicCount} Experts ont leur sujet` : topicCount === 1 ? "1 Expert a son sujet" : "Aucun sujet pour l’instant"}</p>
      </Block>
      {isTelegramLink(s.inviteLink) && (
        <Block
          title="Inviter des collègues"
          action={
            <Button variant="outline" size="sm" onClick={() => void copy(s.inviteLink!)} className="max-sm:h-10">
              {copied ? <Check /> : <Copy />}
              {copied ? "Lien copié" : "Copier le lien"}
            </Button>
          }
        >
          <p className="text-sm text-ink-2">Ils écrivent à vos Experts dans le même groupe.</p>
        </Block>
      )}
      {canManage && (
        <div className="flex justify-end pt-2">
          <DisconnectButton name="Telegram" onConfirm={hub.disconnect} disabled={busy} />
        </div>
      )}
    </div>
  );
}

function Block({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] bg-soft px-4 py-3">
      <div className="min-w-0">
        <h4 className="text-[13px] font-semibold text-ink-3">{title}</h4>
        {children}
      </div>
      {action}
    </section>
  );
}
