"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { PageBody } from "@/components/app/PageBody";
import { ProfileDialog } from "@/components/ProfileDialog";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { SettingsCard, SettingsRow } from "@/components/settings/SettingsRows";
import { Button } from "@/components/ui/button";

// Paramètres · Profil : qui je suis dans l'espace. Le nom, le poste et la photo se changent dans la
// fenêtre de profil (le back-office les garde) ; l'e-mail est celui de la connexion.
export default function Page() {
  const { current, userEmail, userName, userAvatarUrl } = useWorkspace();
  const [open, setOpen] = useState(false);
  const shown = userName ?? userEmail;

  return (
    <PageBody>
      <SettingsCard>
        <div className="flex items-center gap-4 px-5 py-5">
          {userAvatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={userAvatarUrl} alt="" className="size-16 rounded-full object-cover" />
          ) : (
            <span className="grid size-16 place-items-center rounded-full bg-brand text-2xl font-bold text-on-brand">
              {(shown.trim()[0] ?? "?").toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold text-ink">{shown}</p>
            <p className="truncate text-sm text-ink-3">{current?.role === "admin" ? "Administrateur" : "Membre"}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            <Pencil /> Modifier
          </Button>
        </div>
        <SettingsRow label="E-mail" hint="Celui avec lequel vous vous connectez.">
          <span className="text-sm font-semibold text-ink-2">{userEmail}</span>
        </SettingsRow>
        <SettingsRow label="Espace">
          <span className="text-sm font-semibold text-ink-2">{current?.name}</span>
        </SettingsRow>
      </SettingsCard>
      <ProfileDialog open={open} onOpenChange={setOpen} />
    </PageBody>
  );
}
