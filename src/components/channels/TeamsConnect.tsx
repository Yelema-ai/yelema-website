"use client";

import { useState } from "react";
import { CheckCircle2, Copy, ExternalLink, Pencil } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { isChannelConnected, type MessagingPlatform } from "@/lib/channels";
import { Button } from "@/components/ui/button";
import { ChannelPanelHeader, FieldInput } from "@/components/channels/ChannelCredentialsForm";
import { useAsyncAction } from "@/components/useAsyncAction";

// Microsoft Teams: the member creates an Azure Bot in their own Microsoft tenant, gives it the address
// the back office opened on their instance, and hands us its three identifiers plus who may talk to it.
// The BFF checks the identifiers with Microsoft before anything is written.
const FIELDS = [
  { key: "TEAMS_CLIENT_ID", label: "ID d’application (Microsoft App ID)", hint: "Azure Bot › Configuration." },
  { key: "TEAMS_CLIENT_SECRET", label: "Secret client", hint: "Valeur du secret, pas son ID : visible une seule fois, à sa création." },
  { key: "TEAMS_TENANT_ID", label: "ID de l’annuaire (App Tenant ID)", hint: "Azure Bot › Configuration." },
  {
    key: "TEAMS_ALLOWED_USERS",
    label: "Personnes autorisées",
    hint: "Leur « ID d’objet » Microsoft Entra, séparés par des virgules : Centre d’administration Entra › Utilisateurs › la personne › ID d’objet.",
  },
] as const;

// Once set up, what the member reads back: the harness's redacted values, never the secret.
const SUMMARY = [
  { key: "TEAMS_CLIENT_ID", label: "ID d’application" },
  { key: "TEAMS_TENANT_ID", label: "ID de l’annuaire" },
  { key: "TEAMS_ALLOWED_USERS", label: "Personnes autorisées" },
] as const;

function TeamsSummary({ channel, connected }: { channel: MessagingPlatform; connected: boolean }) {
  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
      <p className="flex items-center gap-2 text-sm font-medium">
        <CheckCircle2 className={connected ? "h-4 w-4 text-ok" : "h-4 w-4 text-muted-foreground"} />
        {connected ? "Microsoft Teams est connecté" : "Microsoft Teams est configuré, la connexion est en cours"}
      </p>
      <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-[auto_1fr] sm:gap-x-4">
        {SUMMARY.map(({ key, label }) => {
          const field = channel.env_vars.find((f) => f.key === key);
          return (
            <div key={key} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0 truncate font-mono text-foreground">{field?.is_set ? field.redacted_value || "renseigné" : "—"}</dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

export function TeamsConnect({
  agentId,
  channel,
  endpoint,
  onBack,
}: {
  agentId: string;
  channel: MessagingPlatform;
  endpoint: string | null;
  onBack: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const { busy, run } = useAsyncAction();
  const connected = isChannelConnected(channel);
  const [editing, setEditing] = useState(!channel.configured);

  const save = () =>
    run(async () => {
      await apiFetch(`/api/agents/${agentId}/channels/${channel.id}`, { method: "PUT", body: JSON.stringify({ env: values, enabled: true }) });
      toast.success("Microsoft Teams enregistré. La connexion est en cours.");
      onBack();
    });

  const disconnect = () =>
    run(async () => {
      await apiFetch(`/api/agents/${agentId}/channels/${channel.id}`, { method: "DELETE" });
      toast.success("Microsoft Teams déconnecté");
      onBack();
    });

  const copy = () =>
    void navigator.clipboard.writeText(endpoint ?? "").then(
      () => toast.success("Adresse copiée"),
      () => toast.error("Copie impossible : sélectionnez l’adresse à la main."),
    );

  return (
    <div className="space-y-5">
      <ChannelPanelHeader channel={channel} onBack={onBack} />

      {!editing ? (
        <>
          <TeamsSummary channel={channel} connected={connected} />
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setEditing(true)} disabled={busy}>
              <Pencil className="h-3.5 w-3.5" /> Modifier
            </Button>
            <Button variant="ghost" onClick={disconnect} disabled={busy}>
              Déconnecter
            </Button>
          </div>
        </>
      ) : (
        <>
          {!endpoint ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              L’adresse Teams de vos Experts n’est pas encore prête. Réessayez dans quelques minutes ; si cela dure, écrivez au support Yelema.
            </p>
          ) : (
            <ol className="list-decimal space-y-2 rounded-lg border bg-muted/20 p-4 pl-8 text-xs text-muted-foreground">
              <li>
                Dans le{" "}
                <a href="https://portal.azure.com/#create/Microsoft.AzureBot" target="_blank" rel="noopener noreferrer" className="font-medium text-foreground underline underline-offset-4">
                  portail Azure <ExternalLink className="inline h-3 w-3" />
                </a>
                , créez un <strong>Azure Bot</strong> (offre gratuite F0), type d’application <strong>Locataire unique</strong> (Single Tenant).
              </li>
              <li>
                Dans <em>Configuration</em>, collez cette adresse dans <strong>Point de terminaison de messagerie</strong> (Messaging endpoint), puis enregistrez :
                <span className="mt-1.5 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded border bg-background px-2 py-1 font-mono text-[11px] text-foreground" title={endpoint}>
                    {endpoint}
                  </code>
                  <Button type="button" variant="outline" size="sm" onClick={copy} aria-label="Copier l’adresse">
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </span>
              </li>
              <li>
                Toujours dans <em>Configuration</em>, relevez l’ID d’application et l’ID de l’annuaire ; via <em>Gérer le mot de passe</em>, créez un secret client et copiez sa valeur.
              </li>
              <li>
                Dans <em>Canaux</em>, ajoutez <strong>Microsoft Teams</strong> et acceptez les conditions.
              </li>
              <li>Renseignez ci-dessous les identifiants et les personnes autorisées, puis connectez.</li>
              <li>
                Enfin, dans <em>Canaux</em>, cliquez sur <strong>Ouvrir dans Teams</strong> et écrivez à votre Expert.
              </li>
            </ol>
          )}

          <div className="space-y-4">
            {FIELDS.map(({ key, label, hint }) => {
              const field = channel.env_vars.find((f) => f.key === key);
              return field ? (
                <FieldInput key={key} field={field} label={label} hint={hint} value={values[key]} onChange={(value) => setValues((v) => ({ ...v, [key]: value }))} />
              ) : null;
            })}
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={save} disabled={busy || !endpoint}>
              {connected ? "Enregistrer" : "Connecter Microsoft Teams"}
            </Button>
            {channel.configured && (
              <Button variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
                Annuler
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
