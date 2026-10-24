"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { PRESENTATION_TITLE, type CompanyProfile } from "@/lib/company";
import { CompanyLogos } from "./CompanyLogos";
import { MemoryView } from "@/components/memory/MemoryView";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// "Votre entreprise": for an admin, the logo's images and a presentation; for everyone, the company memory
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
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"note" | null>(null);
  const [note, setNote] = useState("");
  const [writing, setWriting] = useState(false);
  // Remounted after a presentation is deposited, so the memory below lists it.
  const [memoryKey, setMemoryKey] = useState(0);
  const { current, setCurrentLogoUrl } = useWorkspace();
  const admin = current?.role === "admin";
  // The menu shows the main logo: follow it as soon as it changes here.
  useEffect(() => {
    if (profile) setCurrentLogoUrl(profile.logoUrl);
  }, [profile, setCurrentLogoUrl]);

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

  const savePresentation = () =>
    run("note", async () => {
      await apiFetch("/api/memory/items", { method: "POST", body: JSON.stringify({ title: PRESENTATION_TITLE, note, unit: null }) });
      setNote("");
      setWriting(false);
      await load();
      setMemoryKey((k) => k + 1);
      toast.success("Présentation déposée dans la mémoire de l’entreprise.");
    });

  return (
    <div className="max-w-4xl">
      <h1 className="sr-only">Votre entreprise</h1>
      <p className="mt-1 max-w-2xl text-sm text-ink-2">
        Ce que vos Experts savent de votre entreprise, et ce qui met l’espace à son image.
      </p>

      {admin && error && <p className="mt-4 max-w-xl rounded-xl bg-ko-pale px-4 py-3 text-sm text-ko">{error}</p>}
      {admin && !profile && !error && <Loader2 className="mt-6 h-5 w-5 animate-spin text-ink-3" aria-label="Chargement" />}

      {admin && profile && (
        <>
          <Step
            index={1}
            title="Votre logo"
            done={profile.logo}
            hint="Toutes ses versions : claire, sombre, carrée, longue. Le logo principal s’affiche dans votre espace et sur la page de connexion. PNG, JPEG ou WebP, 5 Mo au plus."
          >
            <CompanyLogos profile={profile} onProfile={setProfile} />
          </Step>

          <Step index={2} title="Présentez votre activité" done={profile.note} hint="Quelques lignes : ce que fait l’entreprise, pour qui, ses produits, son vocabulaire. Vos Experts s’en servent à chaque réponse.">
            {/* Once deposited, the presentation lives in the memory below: an empty box here would read as lost. */}
            {profile.note && !writing ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-ink-2">Présentation déposée. Elle est dans la mémoire, plus bas.</p>
                <Button variant="outline" size="sm" onClick={() => setWriting(true)}>
                  <Plus /> Ajouter une note
                </Button>
              </div>
            ) : (
              <>
                <textarea
                  className={`min-h-32 ${FIELD}`}
                  value={note}
                  placeholder="Unifood fabrique et distribue des produits alimentaires…"
                  aria-label="Présentation de l’entreprise"
                  onChange={(e) => setNote(e.target.value)}
                />
                {note.trim() && (
                  <Button className="mt-3" disabled={busy === "note"} onClick={() => void savePresentation()}>
                    {busy === "note" ? "Dépôt en cours…" : profile.note ? "Ajouter la note" : "Déposer la présentation"}
                  </Button>
                )}
              </>
            )}
          </Step>
        </>
      )}

      <MemoryView key={memoryKey} embedded onDeposit={admin ? () => void load() : undefined} />
    </div>
  );
}
