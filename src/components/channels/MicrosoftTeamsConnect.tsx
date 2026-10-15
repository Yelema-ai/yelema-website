"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, ExternalLink, Info, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { isChannelConnected, type ChannelField, type MessagingPlatform } from "@/lib/channels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChannelPanelHeader } from "@/components/channels/ChannelCredentialsForm";
import { useAsyncAction } from "@/components/useAsyncAction";

export function MicrosoftTeamsConnect({
  agentId,
  channel,
  onBack,
}: {
  agentId: string;
  channel: MessagingPlatform;
  onBack: () => void;
}) {
  const connected = isChannelConnected(channel);
  const [editing, setEditing] = useState(!connected);
  const [values, setValues] = useState<Record<string, string>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { busy, run } = useAsyncAction();

  const getField = (key: string): ChannelField | undefined =>
    channel.env_vars.find((f) => f.key === key);

  const clientIdField = getField("TEAMS_CLIENT_ID");
  const clientSecretField = getField("TEAMS_CLIENT_SECRET");
  const tenantIdField = getField("TEAMS_TENANT_ID");
  const allowedUsersField = getField("TEAMS_ALLOWED_USERS");
  const portField = getField("TEAMS_PORT");

  const save = () =>
    run(async () => {
      // Validate required fields if not already set
      if (!clientIdField?.is_set && !values.TEAMS_CLIENT_ID?.trim()) {
        toast.error("L'ID d'application (Client ID) est requis.");
        return;
      }
      if (!clientSecretField?.is_set && !values.TEAMS_CLIENT_SECRET?.trim()) {
        toast.error("Le secret d'application (Client Secret) est requis.");
        return;
      }
      if (!tenantIdField?.is_set && !values.TEAMS_TENANT_ID?.trim()) {
        toast.error("L'ID de locataire (Tenant ID) est requis.");
        return;
      }

      await apiFetch(`/api/agents/${agentId}/channels/${channel.id}`, {
        method: "PUT",
        body: JSON.stringify({ env: values, enabled: true }),
      });
      toast.success("Microsoft Teams enregistré. La passerelle démarre.");
      setEditing(false);
      onBack();
    });

  const disconnect = () =>
    run(async () => {
      await apiFetch(`/api/agents/${agentId}/channels/${channel.id}`, { method: "DELETE" });
      toast.success("Microsoft Teams déconnecté");
      onBack();
    });

  return (
    <div className="space-y-6">
      <ChannelPanelHeader channel={channel} onBack={onBack} />

      {connected && !editing ? (
        <div className="space-y-5 rounded-lg border bg-card p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-500" />
            <div className="space-y-1">
              <p className="text-sm font-semibold">Microsoft Teams est connecté et opérationnel</p>
              <p className="text-xs text-muted-foreground">
                Vos experts sont reliés à votre espace Microsoft Teams. Vos collaborateurs peuvent désormais échanger avec
                eux en message privé ou les mentionner directement dans vos canaux d’équipe.
              </p>
            </div>
          </div>

          <div className="grid gap-2 rounded-md bg-muted/40 p-3 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">ID client Azure :</span>
              <span className="font-mono text-foreground">
                {clientIdField?.redacted_value || (clientIdField?.is_set ? "Configuré" : "Non défini")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">ID de locataire Azure :</span>
              <span className="font-mono text-foreground">
                {tenantIdField?.redacted_value || (tenantIdField?.is_set ? "Configuré" : "Non défini")}
              </span>
            </div>
            {allowedUsersField?.is_set && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Utilisateurs autorisés :</span>
                <span className="font-mono text-foreground">{allowedUsersField.redacted_value || "Restreint"}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(true)} disabled={busy}>
              Modifier les identifiants
            </Button>
            <Button variant="ghost" size="sm" onClick={disconnect} disabled={busy} className="text-destructive hover:bg-destructive/10">
              Déconnecter
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Guide de configuration Azure & Teams */}
          <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <Info className="h-4 w-4 text-brand" />
              Comment déployer votre agent sur Microsoft Teams :
            </div>
            <ol className="list-decimal space-y-2 pl-4 text-xs text-muted-foreground">
              <li>
                Inscrivez une application Bot dans le{" "}
                <a
                  href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-foreground underline underline-offset-4 hover:text-brand"
                >
                  Portail Azure (App Registrations) <ExternalLink className="inline h-3 w-3" />
                </a>{" "}
                ou le{" "}
                <a
                  href="https://dev.teams.microsoft.com/bots"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-foreground underline underline-offset-4 hover:text-brand"
                >
                  Teams Developer Portal <ExternalLink className="inline h-3 w-3" />
                </a>.
              </li>
              <li>
                Récupérez l&apos;<strong>ID d&apos;application (Client ID)</strong> et l&apos;<strong>ID de locataire (Tenant ID)</strong>.
              </li>
              <li>
                Dans <em>Certificats &amp; secrets</em>, générez un nouveau secret client et copiez sa valeur.
              </li>
              <li>
                Dans les paramètres de messagerie de votre bot, configurez le point de terminaison du webhook vers l&apos;adresse sécurisée de votre agent.
              </li>
            </ol>
          </div>

          {/* Formulaire des identifiants */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="TEAMS_CLIENT_ID" className="text-xs">
                ID d&apos;application Azure (Client ID) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="TEAMS_CLIENT_ID"
                autoComplete="off"
                placeholder={clientIdField?.is_set ? clientIdField.redacted_value ?? "Déjà configuré" : "ex. 00000000-0000-0000-0000-000000000000"}
                value={values.TEAMS_CLIENT_ID ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, TEAMS_CLIENT_ID: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                L&apos;identifiant unique de votre bot dans Azure Active Directory.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="TEAMS_CLIENT_SECRET" className="text-xs">
                Secret client Azure (Client Secret) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="TEAMS_CLIENT_SECRET"
                type="password"
                autoComplete="new-password"
                placeholder={clientSecretField?.is_set ? clientSecretField.redacted_value ?? "••••••••••••••••" : "Valeur du secret généré"}
                value={values.TEAMS_CLIENT_SECRET ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, TEAMS_CLIENT_SECRET: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Généré dans &quot;Certificats &amp; secrets&quot; sur le portail Azure.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="TEAMS_TENANT_ID" className="text-xs">
                ID de locataire Azure (Tenant ID) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="TEAMS_TENANT_ID"
                autoComplete="off"
                placeholder={tenantIdField?.is_set ? tenantIdField.redacted_value ?? "Déjà configuré" : "ex. 11111111-1111-1111-1111-111111111111"}
                value={values.TEAMS_TENANT_ID ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, TEAMS_TENANT_ID: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                L&apos;identifiant de votre organisation Microsoft 365 / Azure AD.
              </p>
            </div>

            {/* Réglages avancés */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                {showAdvanced ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                Paramètres avancés (sécurité &amp; réseau)
              </button>

              {showAdvanced && (
                <div className="mt-3 space-y-3 rounded-md border p-3 bg-muted/10">
                  <div className="space-y-1.5">
                    <Label htmlFor="TEAMS_ALLOWED_USERS" className="text-xs flex items-center gap-1.5">
                      <ShieldCheck className="h-3.5 w-3.5 text-brand" />
                      Utilisateurs autorisés (optionnel)
                    </Label>
                    <Input
                      id="TEAMS_ALLOWED_USERS"
                      autoComplete="off"
                      placeholder={allowedUsersField?.is_set ? allowedUsersField.redacted_value ?? "Déjà configuré" : "user@monentreprise.com, user2@monentreprise.com"}
                      value={values.TEAMS_ALLOWED_USERS ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, TEAMS_ALLOWED_USERS: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">
                      Restreint les personnes autorisées à échanger avec le bot (e-mails ou identifiants Azure AD, séparés par une virgule).
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="TEAMS_PORT" className="text-xs">
                      Port du Webhook local
                    </Label>
                    <Input
                      id="TEAMS_PORT"
                      autoComplete="off"
                      placeholder="3978"
                      value={values.TEAMS_PORT ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, TEAMS_PORT: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">
                      Port d&apos;écoute interne pour le Bot Framework (défaut : 3978).
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button onClick={save} disabled={busy}>
              {connected ? "Enregistrer les modifications" : "Connecter Microsoft Teams"}
            </Button>
            {connected && (
              <Button variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
                Annuler
              </Button>
            )}
            {channel.configured && (
              <Button variant="ghost" onClick={disconnect} disabled={busy} className="text-destructive hover:bg-destructive/10">
                Déconnecter
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
