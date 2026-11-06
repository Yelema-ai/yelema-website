"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { PRESENTATION_TITLE, type CompanyProfile } from "@/lib/company";
import { CompanyLogos } from "./CompanyLogos";
import { MemoryView } from "@/components/memory/MemoryView";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { EssentialTile } from "./EssentialTile";

// "Votre entreprise": for an admin, the logo's images and a presentation; for everyone, the company memory
// beneath (reference documents, notes, who reads them). The presentation is a deposit of that memory.

const FIELD = "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm font-normal text-ink focus-visible:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/15";

export function CompanyProfileView() {
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"note" | null>(null);
  const [note, setNote] = useState("");
  const [writing, setWriting] = useState(false);
  const [logos, setLogos] = useState(false);
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

  const logoTile = admin && profile && (
    <EssentialTile
      icon={profile.logoUrl ? <img src={profile.logoUrl} alt="" className="size-full bg-white object-contain p-1" /> : <ImageIcon className="h-5 w-5" />}
      title="Logo"
      done={profile.logo}
      line={profile.logo ? "Logo principal" : "Clair, sombre, carré ou long"}
    >
      <Button variant="outline" size="sm" onClick={() => setLogos(true)}>
        {profile.logo ? "Changer" : "Ajouter"}
      </Button>
    </EssentialTile>
  );
  const presentationTile = admin && profile && (
    <EssentialTile icon={<Building2 className="h-5 w-5" />} title="Présentation" done={profile.note} line={profile.note ? "Dans la mémoire, plus bas" : "Ce que fait l’entreprise, pour qui"}>
      <Button variant={profile.note ? "outline" : "default"} size="sm" onClick={() => setWriting(true)}>
        {profile.note ? "Compléter" : "Écrire"}
      </Button>
    </EssentialTile>
  );

  return (
    <div className="max-w-4xl">
      <h1 className="sr-only">Contexte de l’entreprise</h1>
      <p className="mt-1 max-w-2xl text-sm text-ink-2">Ce que vos Experts savent de votre entreprise.</p>

      {admin && error && <p className="mt-4 max-w-xl rounded-xl bg-ko-pale px-4 py-3 text-sm text-ko">{error}</p>}
      {admin && !profile && !error && <Loader2 className="mt-6 h-5 w-5 animate-spin text-ink-3" aria-label="Chargement" />}

      <MemoryView key={memoryKey} embedded onDeposit={admin ? () => void load() : undefined} logoTile={logoTile || undefined} presentationTile={presentationTile || undefined} />

      {admin && profile && (
        <Dialog open={logos} onOpenChange={setLogos}>
          <DialogContent className="max-w-2xl">
            <DialogTitle>Logo</DialogTitle>
            <DialogDescription>Toutes ses versions : claire, sombre, carrée, longue. Le logo principal s’affiche dans votre espace et sur la page de connexion. PNG, JPEG ou WebP, 5 Mo au plus.</DialogDescription>
            <CompanyLogos profile={profile} onProfile={setProfile} />
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={writing} onOpenChange={(open) => busy !== "note" && setWriting(open)}>
        <DialogContent className="max-w-lg">
          <DialogTitle>{profile?.note ? "Compléter la présentation" : "Présentez votre activité"}</DialogTitle>
          <DialogDescription>Ce que fait l’entreprise, pour qui, ses produits, son vocabulaire. Vos Experts s’en servent à chaque réponse.</DialogDescription>
          <textarea
            className={`min-h-36 ${FIELD}`}
            value={note}
            placeholder="Unifood fabrique et distribue des produits alimentaires…"
            aria-label="Présentation de l’entreprise"
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex justify-end">
            <Button disabled={!note.trim() || busy === "note"} onClick={() => void savePresentation()}>
              {busy === "note" ? "Ajout en cours…" : "Ajouter"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
