"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { PageBody } from "@/components/app/PageBody";
import { SettingsCard, SettingsRow } from "@/components/settings/SettingsRows";
import { Switch } from "@/components/experts/RoutinesTable";
import { Button } from "@/components/ui/button";
import { askNotificationPermission, notificationSupport, type NotificationSupport } from "@/components/activity/system-notify";
import { DEFAULT_NOTIFY_PREFS, readNotifyPrefs, saveNotifyPrefs, type NoticeKind, type NotifyPrefs } from "@/lib/notify-prefs";

// Paramètres · Notifications : ce qui mérite d'interrompre, sur le web et dans l'app seulement.
// Un type coupé reste dans la cloche ; il ne s'affiche plus en bulle ni en notification.
const KINDS: { kind: NoticeKind; label: string; hint: string }[] = [
  { kind: "reply", label: "Réponses", hint: "Quand le chat d’entreprise ou un Expert vous répond." },
  { kind: "routine", label: "Routines terminées", hint: "Quand une routine a livré son résultat." },
  { kind: "deliverable", label: "Nouveaux livrables", hint: "Quand un fichier arrive dans les livrables." },
  { kind: "failed", label: "Problèmes", hint: "Une réponse qui échoue, un compte d’IA à recharger." },
];

export default function Page() {
  const [notif, setNotif] = useState<NotificationSupport>("unsupported");
  const [prefs, setPrefs] = useState<NotifyPrefs>(DEFAULT_NOTIFY_PREFS);
  useEffect(() => {
    setNotif(notificationSupport());
    setPrefs(readNotifyPrefs());
  }, []);

  async function enable() {
    const next = await askNotificationPermission();
    setNotif(next);
    if (next === "granted") toast.success("Notifications activées sur cet appareil.");
  }

  function flip(kind: NoticeKind) {
    const next = { ...prefs, [kind]: !prefs[kind] };
    setPrefs(next);
    saveNotifyPrefs(next);
  }

  return (
    <PageBody>
      <SettingsCard>
        {KINDS.map((k) => (
          <SettingsRow key={k.kind} label={k.label} hint={k.hint} inline>
            <Switch on={prefs[k.kind]} label={k.label} onChange={() => flip(k.kind)} />
          </SettingsRow>
        ))}
      </SettingsCard>

      <div className="mt-4">
        <SettingsCard>
          <SettingsRow
            label="Sur cet appareil"
            hint={
              notif === "denied"
                ? "Refusées : autorisez-les dans les réglages du navigateur."
                : notif === "unsupported"
                  ? "Ce navigateur ne sait pas afficher de notifications."
                  : "Être prévenu même dans un autre onglet."
            }
          >
            {notif === "granted" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-ok-pale px-2.5 py-1 text-xs font-semibold text-ok">
                <Check className="h-3.5 w-3.5" /> Activées
              </span>
            ) : notif === "default" ? (
              <Button size="sm" onClick={() => void enable()}>
                Activer
              </Button>
            ) : null}
          </SettingsRow>
        </SettingsCard>
      </div>
    </PageBody>
  );
}
