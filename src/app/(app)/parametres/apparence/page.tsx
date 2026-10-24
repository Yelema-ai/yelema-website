"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { PageBody } from "@/components/app/PageBody";
import { SettingsCard, SettingsRow } from "@/components/settings/SettingsRows";
import { applyAppearance, readAppearance, type Appearance } from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS: { value: Appearance; label: string; icon: typeof Sun }[] = [
  { value: "clair", label: "Clair", icon: Sun },
  { value: "sombre", label: "Sombre", icon: Moon },
  { value: "auto", label: "Automatique", icon: Monitor },
];

// Paramètres · Apparence : clair, sombre ou comme l'appareil. Le soleil de la barre du haut reste
// un raccourci vers le même réglage.
export default function Page() {
  const [appearance, setAppearance] = useState<Appearance>("auto");
  useEffect(() => setAppearance(readAppearance()), []);

  return (
    <PageBody>
      <SettingsCard>
        <SettingsRow label="Thème">
          <div role="radiogroup" aria-label="Thème" className="flex gap-1 rounded-full bg-soft p-1">
            {OPTIONS.map((o) => {
              const Icon = o.icon;
              const on = appearance === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    setAppearance(o.value);
                    applyAppearance(o.value);
                  }}
                  className={cn(
                    "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-colors",
                    on ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink"
                  )}
                >
                  <Icon className="size-4" />
                  {o.label}
                </button>
              );
            })}
          </div>
        </SettingsRow>
      </SettingsCard>
    </PageBody>
  );
}
