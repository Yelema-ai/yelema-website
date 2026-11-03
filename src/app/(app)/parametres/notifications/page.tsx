"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageBody } from "@/components/app/PageBody";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { SettingsCard, SettingsRow } from "@/components/settings/SettingsRows";
import { Switch } from "@/components/experts/RoutinesTable";
import { Button } from "@/components/ui/button";
import { askNotificationPermission, notificationSupport, setSystemNotifyOn, systemNotifyOn, type NotificationSupport } from "@/components/activity/system-notify";
import { DEFAULT_NOTIFY_PREFS, readNotifyPrefs, saveNotifyPrefs, type NoticeKind, type NotifyPrefs } from "@/lib/notify-prefs";
import { syncPrefs } from "@/lib/prefs-sync";

// Paramètres, Notifications : ce qui mérite d'interrompre, sur le web et dans l'app seulement. Deux
// réglages distincts, nommés comme on les voit (Leslie, 30/10 : « tu actives la cloche, le pop-up ou
// le numéro ? ») : les pop-ups dans l'app, par type, et les notifications de l'ordinateur sur cet
// appareil, qu'on peut aussi couper. La cloche garde tout, quoi qu'on coupe.
const KINDS: { kind: NoticeKind; label: string; hint: string }[] = [
  { kind: "reply", label: "Réponses des Experts", hint: "Quand un Expert répond à votre message." },
  { kind: "routine", label: "Routines terminées", hint: "Quand une routine a livré son résultat." },
  { kind: "deliverable", label: "Nouveaux livrables", hint: "Quand un fichier arrive dans les livrables." },
  { kind: "failed", label: "Problèmes", hint: "Une réponse qui échoue, un compte d’IA à recharger." },
];
// Un membre qui n'a que le chat d'entreprise : ni Experts ni routines.
const CHAT_ONLY_KINDS = [
  { kind: "reply" as const, label: "Réponses du chat d’entreprise", hint: "Quand le chat d’entreprise vous répond." },
  ...KINDS.filter((k) => k.kind !== "reply" && k.kind !== "routine"),
];

export default function Page() {
  const kinds = useWorkspace().current?.access === "entreprise" ? CHAT_ONLY_KINDS : KINDS;
  const [notif, setNotif] = useState<NotificationSupport>("unsupported");
  const [prefs, setPrefs] = useState<NotifyPrefs>(DEFAULT_NOTIFY_PREFS);
  const [deviceOn, setDeviceOn] = useState(true);
  useEffect(() => {
    setNotif(notificationSupport());
    setDeviceOn(systemNotifyOn());
    setPrefs(readNotifyPrefs());
    void syncPrefs().then(() => setPrefs(readNotifyPrefs()));
  }, []);

  async function enable() {
    const next = await askNotificationPermission();
    setNotif(next);
    if (next === "granted") {
      setSystemNotifyOn(true);
      setDeviceOn(true);
      toast.success("Notifications activées sur cet appareil.");
    }
  }

  function flip(kind: NoticeKind) {
    const next = { ...prefs, [kind]: !prefs[kind] };
    setPrefs(next);
    void saveNotifyPrefs(next);
  }

  function flipDevice() {
    setSystemNotifyOn(!deviceOn);
    setDeviceOn(!deviceOn);
  }

  const section = "mb-2 px-1 text-[12px] font-bold uppercase tracking-wider text-ink-3";
  return (
    <PageBody>
      <p className={section}>Pop-ups dans l’app</p>
      <SettingsCard>
        {kinds.map((k) => (
          <SettingsRow key={k.kind} label={k.label} hint={k.hint} inline>
            <Switch on={prefs[k.kind]} label={k.label} onChange={() => flip(k.kind)} />
          </SettingsRow>
        ))}
      </SettingsCard>

      <p className="mt-2 px-1 text-[13px] text-ink-3">La cloche garde toujours tout, même ce que vous coupez ici.</p>

      <div className="mt-7">
        <p className={section}>Notifications de l’ordinateur</p>
        <SettingsCard>
          <SettingsRow
            label="Sur cet appareil"
            inline={notif === "granted"}
            hint={
              notif === "denied"
                ? "Refusées : autorisez-les dans les réglages du navigateur."
                : notif === "unsupported"
                  ? "Ce navigateur ne sait pas afficher de notifications."
                  : "Une alerte de l’ordinateur quand Yelema est dans un autre onglet, pour les types activés au-dessus."
            }
          >
            {notif === "granted" ? (
              <Switch on={deviceOn} label="Notifications de l’ordinateur" onChange={flipDevice} />
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
