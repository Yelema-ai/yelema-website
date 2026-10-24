"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageBody } from "@/components/app/PageBody";
import { SettingsCard, SettingsRow } from "@/components/settings/SettingsRows";
import { Picker } from "@/components/ui/picker";

// Paramètres · Général : la langue et le fuseau horaire. L'interface n'existe qu'en français pour
// l'instant : l'anglais se choisit mais n'est pas encore traduit, et le dit.
export default function Page() {
  const [zone, setZone] = useState<string | null>(null);
  useEffect(() => setZone(Intl.DateTimeFormat().resolvedOptions().timeZone), []);

  return (
    <PageBody>
      <SettingsCard>
        <SettingsRow label="Langue">
          <Picker
            label="Langue"
            placeholder="Français"
            value="fr"
            onChange={(v) => v === "en" && toast.info("L’interface en anglais arrive bientôt.")}
            groups={[{ options: [{ value: "fr", label: "Français" }, { value: "en", label: "English" }] }]}
            className="w-48"
          />
        </SettingsRow>
        <SettingsRow label="Fuseau horaire" hint="Celui de votre appareil : les routines et les dates s’y règlent.">
          <span className="text-sm font-semibold text-ink-2">{zone ? zone.replace(/^.*\//, "").replace(/_/g, " ") : "…"}</span>
        </SettingsRow>
      </SettingsCard>
    </PageBody>
  );
}
