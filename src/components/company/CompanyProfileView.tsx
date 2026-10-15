"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, readApiError } from "@/lib/api";
import { LOGO_ACCEPT, LOGO_MAX_BYTES, PRESENTATION_TITLE, type CompanyProfile } from "@/lib/company";
import { HiddenFileInput } from "@/components/HiddenFileInput";
import { MemoryView } from "@/components/memory/MemoryView";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// "Votre entreprise": for an admin, the logo and a presentation; for everyone, the company memory
// beneath (reference documents, notes, who reads them). The presentation is a deposit of that memory.

const FIELD = "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm font-normal text-ink focus-visible:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/15";

function Step({ index, title, done, hint, children }: { index: number; title: string; done: boolean; hint: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 rounded-[22px] border border-line bg-surface p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold", done ? "bg-brand text-on-brand" : "bg-soft-2 text-brand-ink")} aria-hidden>
          {done ? <Check className="h-4 w-4" /> : index}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-ink">
            {title} <span className="sr-only">{done ? "(fait)" : "(à faire)"}</span>
          </h2>
          <p className="mt-0.5 text-sm text-ink-2">{hint}</p>
          <div className="mt-4">{children}</div>
        </div>
      </div>
    </section>
  );
}

export function CompanyProfileView() {
  const router = useRouter();
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"logo" | "note" | null>(null);
  const [note, setNote] = useState("");
  // Remounted after a presentation is deposited, so the memory below lists it.
  const [memoryKey, setMemoryKey] = useState(0);
  const logoPicker = useRef<HTMLInputElement>(null);
  const admin = useWorkspace().current?.role === "admin";

  const load = useCallback(
    () =>
      apiFetch<CompanyProfile>("/api/workspace/profile")
        .then(setProfile)
        .catch((e: Error) => setError(e.message)),
    []
  );
  useEffect(() => {
    if (admin) void load();
  }, [admin, load]);

  async function run(step: NonNullable<typeof busy>, action: () => Promise<void>) {
    setBusy(step);
    try {
      await action();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const sendLogo = (picked: File) =>
    run("logo", async () => {
      if (!LOGO_ACCEPT.split(",").includes(picked.type)) throw new Error("Choisissez une image PNG, JPEG ou WebP.");
      if (picked.size > LOGO_MAX_BYTES) throw new Error("Le logo ne doit pas dépasser 5 Mo.");
      const form = new FormData();
      form.set("file", picked);
      const res = await fetch("/api/workspace/logo", { method: "POST", body: form });
      if (!res.ok) throw new Error(await readApiError(res, "Le logo n’a pas pu être enregistré."));
      setProfile((await res.json()) as CompanyProfile);
      // The sidebar's logo is rendered by the server: read it again.
      router.refresh();
    });

  const removeLogo = () =>
    run("logo", async () => {
      setProfile(await apiFetch<CompanyProfile>("/api/workspace/logo", { method: "DELETE" }));
      router.refresh();
    });

  const savePresentation = () =>
    run("note", async () => {
      await apiFetch("/api/memory/items", { method: "POST", body: JSON.stringify({ title: PRESENTATION_TITLE, note, unit: null }) });
      setNote("");
      await load();
      setMemoryKey((k) => k + 1);
      toast.success("Présentation déposée dans la mémoire de l’entreprise.");
    });

  return (
    <div className="max-w-4xl">
      <h1 className="font-display text-[28px] font-bold tracking-tight text-ink">Votre entreprise</h1>
      <p className="mt-1 max-w-2xl text-sm text-ink-2">
        Ce que vos experts savent de votre entreprise, et ce qui met l’espace à son image.
        {admin && profile && ` ${profile.done} sur ${profile.total} ${profile.done > 1 ? "étapes faites" : "étape faite"}.`}
      </p>

      {admin && error && <p className="mt-4 max-w-xl rounded-xl bg-ko-pale px-4 py-3 text-sm text-ko">{error}</p>}
      {admin && !profile && !error && <Loader2 className="mt-6 h-5 w-5 animate-spin text-ink-3" aria-label="Chargement" />}

      {admin && profile && (
        <>
          <Step index={1} title="Votre logo" done={profile.logo} hint="Affiché dans votre espace et sur la page de connexion. PNG, JPEG ou WebP, 5 Mo au plus.">
            <div className="flex flex-wrap items-center gap-4">
              {profile.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.logoUrl} alt="Logo actuel" className="size-16 rounded-xl border border-line object-contain" />
              )}
              <Button type="button" variant={profile.logo ? "outline" : "default"} disabled={busy === "logo"} onClick={() => logoPicker.current?.click()}>
                {busy === "logo" ? "Envoi en cours…" : profile.logo ? "Changer de logo" : "Choisir un logo"}
              </Button>
              {profile.logo && (
                <Button type="button" variant="ghost" disabled={busy === "logo"} onClick={() => void removeLogo()}>
                  Retirer
                </Button>
              )}
            </div>
            <HiddenFileInput inputRef={logoPicker} onFiles={(files) => files[0] && void sendLogo(files[0])} />
          </Step>

          <Step index={2} title="Présentez votre activité" done={profile.note} hint="Quelques lignes : ce que fait l’entreprise, pour qui, ses produits, son vocabulaire. Vos experts s’en servent à chaque réponse.">
            <textarea className={`min-h-32 ${FIELD}`} value={note} aria-label="Présentation de l’entreprise" onChange={(e) => setNote(e.target.value)} />
            <Button className="mt-3" disabled={busy === "note" || !note.trim()} onClick={() => void savePresentation()}>
              {busy === "note" ? "Dépôt en cours…" : profile.note ? "Ajouter une autre note" : "Déposer la présentation"}
            </Button>
          </Step>
        </>
      )}

      <MemoryView key={memoryKey} embedded onDeposit={admin ? () => void load() : undefined} />
    </div>
  );
}
