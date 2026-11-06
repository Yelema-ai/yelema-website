"use client";

import { useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { isChannelConnected, type MessagingPlatform } from "@/lib/channels";
import { Button } from "@/components/ui/button";
import { ChannelPanelHeader, FieldInput } from "@/components/channels/ChannelCredentialsForm";
import { useAsyncAction } from "@/components/useAsyncAction";
import { DisconnectButton } from "@/components/channels/DisconnectButton";

// Slack in Socket Mode (outbound, no public address): the member creates the app from the manifest
// below, installs it, and hands us its two tokens plus the member ids allowed to talk to it. Scopes and
// events are the ones the agent's Slack adapter needs (hermes-agent docs, Slack setup).
const BOT_SCOPES = [
  "app_mentions:read",
  "channels:history",
  "channels:read",
  "chat:write",
  "files:read",
  "files:write",
  "groups:history",
  "groups:read",
  "im:history",
  "im:read",
  "im:write",
  "mpim:history",
  "mpim:read",
  "users:read",
];
const BOT_EVENTS = ["app_mention", "message.channels", "message.groups", "message.im", "message.mpim"];

// Slack caps an app's name at 35 characters.
function manifest(name: string): string {
  const appName = (name.trim() || "Expert Yelema").slice(0, 35);
  return JSON.stringify(
    {
      display_information: { name: appName },
      features: {
        app_home: { messages_tab_enabled: true, messages_tab_read_only_enabled: false },
        bot_user: { display_name: appName, always_online: true },
      },
      oauth_config: { scopes: { bot: BOT_SCOPES } },
      settings: { event_subscriptions: { bot_events: BOT_EVENTS }, interactivity: { is_enabled: true }, socket_mode_enabled: true, token_rotation_enabled: false },
    },
    null,
    2,
  );
}

const FIELDS = [
  { key: "SLACK_BOT_TOKEN", label: "Clé du bot (xoxb-…)", hint: "OAuth & Permissions › Bot User OAuth Token, après l’installation." },
  { key: "SLACK_APP_TOKEN", label: "Clé de l’application (xapp-…)", hint: "Basic Information › App-Level Tokens › Generate, avec le droit connections:write." },
  {
    key: "SLACK_ALLOWED_USERS",
    label: "Personnes autorisées",
    hint: "Leurs identifiants de membre (U…), séparés par des virgules : profil de la personne › ⋮ › Copier l’ID de membre.",
  },
] as const;

export function SlackConnect({ agentId, agentName, channel, onBack }: { agentId: string; agentName: string; channel: MessagingPlatform; onBack: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const { busy, run } = useAsyncAction();
  const connected = isChannelConnected(channel);
  const text = manifest(agentName);

  const save = () =>
    run(async () => {
      await apiFetch(`/api/agents/${agentId}/channels/${channel.id}`, { method: "PUT", body: JSON.stringify({ env: values, enabled: true }) });
      toast.success("Slack enregistré. La connexion est en cours.");
      onBack();
    });

  const disconnect = () =>
    run(async () => {
      await apiFetch(`/api/agents/${agentId}/channels/${channel.id}`, { method: "DELETE" });
      toast.success("Slack déconnecté");
      onBack();
    });

  const copy = () =>
    void navigator.clipboard.writeText(text).then(
      () => toast.success("Manifeste copié"),
      () => toast.error("Copie impossible : sélectionnez le texte à la main."),
    );

  return (
    <div className="space-y-5">
      <ChannelPanelHeader channel={channel} onBack={onBack} />

      <ol className="list-decimal space-y-2 rounded-lg border bg-muted/20 p-4 pl-8 text-xs text-muted-foreground">
        <li>
          Sur{" "}
          <a href="https://api.slack.com/apps?new_app=1" target="_blank" rel="noopener noreferrer" className="font-medium text-foreground underline underline-offset-4">
            api.slack.com/apps <ExternalLink className="inline h-3 w-3" />
          </a>
          , choisissez <strong>Create New App › From a manifest</strong>, votre espace Slack, puis collez ce manifeste (onglet JSON) :
          <span className="mt-1.5 block space-y-1.5">
            <pre className="max-h-40 overflow-auto rounded border bg-background p-2 font-mono text-[11px] text-foreground">{text}</pre>
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={copy}>
              <Copy className="h-3.5 w-3.5" /> Copier le manifeste
            </Button>
          </span>
        </li>
        <li>
          <strong>Install App › Install to Workspace</strong>, puis copiez la clé du bot (xoxb-…).
        </li>
        <li>
          <strong>Basic Information › App-Level Tokens</strong> : créez une clé avec le droit <code>connections:write</code> et copiez-le (xapp-…).
        </li>
        <li>Renseignez ci-dessous les deux clés et les personnes autorisées, puis connectez. Écrivez ensuite à l’application dans Slack.</li>
      </ol>

      <div className="space-y-4">
        {FIELDS.map(({ key, label, hint }) => {
          const field = channel.env_vars.find((f) => f.key === key);
          return field ? (
            <FieldInput key={key} field={field} label={label} hint={hint} value={values[key]} onChange={(value) => setValues((v) => ({ ...v, [key]: value }))} />
          ) : null;
        })}
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={busy}>
          {connected ? "Enregistrer" : "Connecter Slack"}
        </Button>
        {channel.configured && (
          <DisconnectButton name="Slack" onConfirm={disconnect} disabled={busy} />
        )}
      </div>
    </div>
  );
}
