"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AudioLines, Loader2, Palette, RotateCcw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ExpertImage } from "@/components/experts/ExpertImage";
import { AvatarConfigModal } from "@/components/experts/AvatarConfigModal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useExpertsContext } from "@/components/experts/ExpertsProvider";
import { apiFetch, readApiError } from "@/lib/api";
import type { ExpertAvatarDraft, ExpertLook } from "@/lib/backoffice";
import { EXPERT_NAME_MAX, EXPERT_NAME_RULE, expertName } from "@/lib/expert-looks";
import { MAX_UPLOAD_BYTES, TOO_LARGE } from "@/lib/upload-limit";
import { useVoices } from "@/components/voice/useVoices";
import { useVoiceExpert } from "@/components/voice/useVoiceExpert";
import { loadVoicePrefs } from "@/lib/voice-prefs";
import { chosenVoice, countryFlag, countryName, expertDefaultVoice, VOICE_LANGUAGES, type VoicePrefs } from "@/lib/voice";

const GENDER_LABEL = { female: "Femme", male: "Homme", neutral: "Neutre" } as const;

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

// How far the expert itself has got with its new name: the back office writes it in its SOUL.md
// in the background, and the expert introduces itself that way once it is there.
function identityNote(look: ExpertLook): string | null {
  const name = look.displayName ?? look.defaultName;
  if (look.identity.state === "pending") return `${name} apprend son nom. Cela prend une minute.`;
  if (look.identity.state === "failed") return `Le nom n’a pas encore pu être transmis à l’Expert : enregistrez-le à nouveau dans un moment.`;
  return null;
}

/**
 * A member's own name and picture for one expert of their team, over the catalogue's: the name is
 * written in the expert itself (it introduces itself and signs that way); the picture is theirs to
 * import, or to have drawn by the studio from the expert's face. The drive folder and the e-mail
 * sender keep the catalogue's name.
 */
export function ExpertEditModal({
  expertKey,
  open,
  onOpenChange,
  onVoice,
}: {
  expertKey: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** « Sa voix » opens the voice window, where voice is on. */
  onVoice?: () => void;
}) {
  const { reload, applyLook } = useExpertsContext();
  const [look, setLook] = useState<ExpertLook | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<"save" | "reset" | null>(null);
  // The picture chosen but not sent yet: a file from the device, or a portrait from the studio.
  const [pending, setPending] = useState<{ file: File } | { draft: ExpertAvatarDraft } | null>(null);
  const [studioOpen, setStudioOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const url = `/api/experts/${encodeURIComponent(expertKey)}`;
  // The voice it speaks with now, shown before any change: the one chosen, else its default.
  const voices = useVoices();
  const voiceExpert = useVoiceExpert();
  const [voicePrefs, setVoicePrefs] = useState<VoicePrefs | null>(null);
  useEffect(() => {
    let live = true;
    if (open && onVoice) void loadVoicePrefs(expertKey).then((p) => live && setVoicePrefs(p), () => undefined);
    return () => {
      live = false;
    };
  }, [open, onVoice, expertKey]);
  const voiceNow = voicePrefs ? chosenVoice(voices, voicePrefs, voiceExpert(expertKey)) : null;
  const voiceIsDefault = Boolean(
    voiceNow && voicePrefs && voiceNow.key === (expertDefaultVoice(voices, voicePrefs.language, voiceExpert(expertKey)) ?? voices.find((v) => v.language === voicePrefs.language && v.default))?.key
  );

  useEffect(() => {
    if (!open) return;
    // Opening again starts from what the back office has: what was not saved is dropped.
    setLook(null);
    setPending(null);
    apiFetch<ExpertLook>(url).then(
      (l) => {
        setLook(l);
        setName(l.displayName ?? l.defaultName);
      },
      (e: Error) => {
        toast.error(e.message);
        onOpenChange(false);
      }
    );
  }, [open, url, onOpenChange]);

  // Every change lands at once: the team and the chat read the new look again.
  const changed = (l: ExpertLook) => {
    setLook(l);
    applyLook(l);
    reload();
  };

  const pickFile = (file: File | undefined) => {
    if (fileInput.current) fileInput.current.value = "";
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) return void toast.error("Choisissez une image PNG, JPEG ou WebP.");
    if (file.size > MAX_UPLOAD_BYTES) return void toast.error(TOO_LARGE);
    setPending({ file });
  };

  const applyDraft = (draft: ExpertAvatarDraft) => setPending({ draft });

  // What the circle shows before saving: the chosen file read locally, or the studio's portrait.
  const pendingFile = pending && "file" in pending ? pending.file : null;
  const localPreview = useMemo(() => (pendingFile ? URL.createObjectURL(pendingFile) : null), [pendingFile]);
  useEffect(() => () => {
    if (localPreview) URL.revokeObjectURL(localPreview);
  }, [localPreview]);
  const preview = localPreview ?? (pending && "draft" in pending ? pending.draft.url : null);

  const sendAvatar = async (p: NonNullable<typeof pending>) => {
    const form = new FormData();
    if ("file" in p) form.set("file", p.file);
    else form.set("draftId", p.draft.draftId);
    const res = await fetch(`${url}/avatar`, { method: "PUT", body: form });
    if (!res.ok) throw new Error(await readApiError(res, "L’image n’a pas pu être enregistrée."));
    return (await res.json()) as ExpertLook;
  };

  const cleaned = expertName(name);
  const nameChanged = look !== null && cleaned !== null && cleaned !== (look.displayName ?? look.defaultName);

  const dirty = nameChanged || pending !== null;

  // One gesture for everything chosen: the picture first, then the name. A step that went through
  // stays (the screen shows the back office's state); the error says what is left.
  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    if (!look || busy || !dirty || !cleaned) return;
    setBusy("save");
    let pictureSaved = false;
    try {
      if (pending) {
        changed(await sendAvatar(pending));
        setPending(null);
        pictureSaved = true;
      }
      if (nameChanged && cleaned) {
        // Its catalogue name again is the same as no name of the member's own.
        const displayName = cleaned === look.defaultName ? null : cleaned;
        changed(await apiFetch<ExpertLook>(url, { method: "PATCH", body: JSON.stringify({ displayName }) }));
      }
      toast.success(nameChanged && cleaned ? `C’est enregistré : l’Expert s’appelle désormais ${cleaned}.` : "C’est enregistré : le nouveau portrait est en place.");
      onOpenChange(false);
    } catch (err) {
      toast.error(pictureSaved ? `Le portrait est enregistré, mais pas le nom : ${(err as Error).message}` : (err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const saved = look?.avatarUrl ?? look?.defaultAvatarUrl ?? null;
  const portrait = preview ?? saved;
  const customized = Boolean(look && (look.displayName || look.avatarUrl));

  // Back to the catalogue's name and face, in one gesture: the name first, then the picture. Each
  // step that went through is shown at once, so a picture refused after the name leaves the screen
  // as the back office now has it.
  async function resetAll() {
    if (!look) return;
    setBusy("reset");
    setPending(null);
    let l = look;
    const step = (next: ExpertLook) => {
      l = next;
      changed(l);
      setName(l.displayName ?? l.defaultName);
    };
    try {
      if (l.displayName) step(await apiFetch<ExpertLook>(url, { method: "PATCH", body: JSON.stringify({ displayName: null }) }));
      if (l.avatarUrl) step(await apiFetch<ExpertLook>(`${url}/avatar`, { method: "DELETE" }));
      toast.success(`${l.defaultName} a retrouvé son nom et son portrait d’origine.`);
    } catch (e) {
      const nameBack = look.displayName && !l.displayName;
      toast.error(nameBack ? `${l.defaultName} a retrouvé son nom, mais pas son portrait : ${(e as Error).message}` : (e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  const note = look ? identityNote(look) : null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogTitle>Personnaliser {look ? (look.displayName ?? look.defaultName) : "l’Expert"}</DialogTitle>
          <DialogDescription>
            {look ? `${look.role ?? "Expert"} · nom d’origine : ${look.defaultName}` : "Chargement…"}
          </DialogDescription>

          {look ? (
            <div className="flex flex-col gap-5">
              <form id="expert-edit" onSubmit={save} className="flex flex-col gap-1.5">
                <Label htmlFor="expert-name">Son nom</Label>
                <Input id="expert-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={EXPERT_NAME_MAX} required autoComplete="off" disabled={busy !== null} />
                <p className="text-xs text-ink-3">
                  {cleaned || !name.trim() ? "Il se présentera et signera sous ce nom, dans la discussion, sur vos canaux et au téléphone." : EXPERT_NAME_RULE}
                </p>
                {note && <p className="text-xs font-medium text-ink-2">{note}</p>}
              </form>

              {onVoice && (
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <Label>Sa voix</Label>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-ink">
                      {voiceNow ? (
                        <>
                          <b className="font-semibold">{voiceNow.label}</b>
                          <span className="text-ink-3">
                            {GENDER_LABEL[voiceNow.gender]}, {countryFlag(voiceNow.country)} {countryName(voiceNow.country)},{" "}
                            {VOICE_LANGUAGES.find((l) => l.id === voiceNow.language)?.label.toLowerCase()}
                          </span>
                          {voiceIsDefault && <span className="rounded-full bg-soft px-1.5 py-0.5 text-[10.5px] font-semibold text-ink-2">par défaut</span>}
                        </>
                      ) : (
                        <span className="text-ink-3">Chargement…</span>
                      )}
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => {
                      onOpenChange(false);
                      onVoice();
                    }}
                    className="gap-1.5"
                  >
                    <AudioLines className="size-4" />
                    Changer
                  </Button>
                </div>
              )}

              <div className="flex flex-col gap-3">
                <Label>Son portrait</Label>
                <div className="flex items-center gap-4">
                  {/* Fixed color on purpose: behind a portrait, in both themes. */}
                  <div className="relative size-20 shrink-0 overflow-hidden rounded-full bg-[#8E6FB0]">
                    {portrait && <ExpertImage src={portrait} size={80} className="size-full object-cover object-[50%_15%]" />}
                    {busy === "save" && pending && (
                      <div className="absolute inset-0 grid place-items-center bg-black/30">
                        <Loader2 className="size-5 animate-spin text-white" />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" onClick={() => setStudioOpen(true)} disabled={busy !== null} className="gap-1.5">
                      <Palette className="size-4" />
                      Studio portrait IA
                    </Button>
                    <input ref={fileInput} type="file" accept={IMAGE_TYPES.join(",")} hidden onChange={(e) => pickFile(e.target.files?.[0])} />
                    <Button type="button" variant="outline" onClick={() => fileInput.current?.click()} disabled={busy !== null} className="gap-1.5">
                      <Upload className="size-4" />
                      Importer
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-ink-3">Le studio garde son visage et change la pose, la tenue, l’accessoire et le fond. PNG, JPEG ou WebP de 4 Mo au plus pour une image importée.</p>
              </div>

              {customized && (
                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-soft px-3 py-2.5">
                  {/* Fixed color on purpose: behind a portrait, in both themes. */}
                  <span className="relative size-10 shrink-0 overflow-hidden rounded-full bg-[#8E6FB0]">
                    {look.defaultAvatarUrl && <ExpertImage src={look.defaultAvatarUrl} size={40} className="size-full object-cover object-[50%_15%]" />}
                  </span>
                  <span className="min-w-0 grow">
                    <span className="block text-sm font-semibold text-ink">{look.defaultName}</span>
                    <span className="block text-xs text-ink-3">Profil d’origine</span>
                  </span>
                  <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => setResetOpen(true)} className="gap-1.5">
                    <RotateCcw className="size-4" />
                    Revenir au profil d’origine
                  </Button>
                </div>
              )}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="ghost" disabled={busy === "save"} onClick={() => onOpenChange(false)}>
                  Annuler
                </Button>
                <Button type="submit" form="expert-edit" disabled={!dirty || !cleaned || busy !== null} className="min-w-32 gap-1.5">
                  {busy === "save" && <Loader2 className="size-4 animate-spin" />}
                  {busy === "save" ? "Enregistrement…" : "Enregistrer"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid min-h-40 place-items-center">
              <Loader2 className="size-6 animate-spin text-brand" />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Revenir au profil d’origine ?"
        description={look ? `Le nom ${look.defaultName} et le portrait d’origine reviennent. Le nom et la photo choisis sont effacés.` : ""}
        confirmText="Revenir au profil d’origine"
        onConfirm={resetAll}
      />

      {look && studioOpen && (
        <AvatarConfigModal
          open
          onOpenChange={setStudioOpen}
          expertKey={expertKey}
          expertName={look.displayName ?? look.defaultName}
          currentAvatarUrl={saved}
          onApplyAvatar={applyDraft}
        />
      )}
    </>
  );
}
