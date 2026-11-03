"use client";

import { useEffect, useRef, useState } from "react";
import {
  Accessibility,
  Armchair,
  Briefcase,
  Crown,
  FileText,
  Footprints,
  Gem,
  Glasses,
  HardHat,
  Headphones,
  IdCard,
  ImagePlus,
  Laptop,
  Loader2,
  PersonStanding,
  Presentation,
  Shirt,
  Smartphone,
  Sparkles,
  Tablet,
  User,
  UserRound,
  X,
  Check,
} from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import type { ExpertAvatarDraft } from '@/lib/backoffice';
import { MAX_UPLOAD_BYTES, TOO_LARGE } from '@/lib/upload-limit';
import {
  type AgentAvatarConfig,
  type AvatarAccessory,
  type AvatarBackground,
  type AvatarPosition,
  type AvatarStyle,
  AVATAR_ACCESSORY_LABELS,
  AVATAR_BACKGROUND_COLORS,
  AVATAR_BACKGROUND_LABELS,
  AVATAR_POSITION_LABELS,
  AVATAR_STYLE_LABELS,
  DEFAULT_AVATAR_CONFIG,
} from './avatarContracts';

interface Option<T extends string> {
  key: T;
  icon: React.ReactNode;
}

const POSITIONS: Option<AvatarPosition>[] = [
  { key: 'auto', icon: <Sparkles className="size-3.5" /> },
  { key: 'face', icon: <User className="size-3.5" /> },
  { key: 'trois-quarts', icon: <UserRound className="size-3.5" /> },
  { key: 'profil', icon: <PersonStanding className="size-3.5" /> },
  { key: 'bras-croises', icon: <Accessibility className="size-3.5" /> },
  { key: 'assis', icon: <Armchair className="size-3.5" /> },
  { key: 'marche', icon: <Footprints className="size-3.5" /> },
  { key: 'reunion', icon: <Presentation className="size-3.5" /> },
];

const STYLES: Option<AvatarStyle>[] = [
  { key: 'auto', icon: <Sparkles className="size-3.5" /> },
  { key: 'casual', icon: <Shirt className="size-3.5" /> },
  { key: 'smart-casual', icon: <Shirt className="size-3.5" /> },
  { key: 'blazer', icon: <Shirt className="size-3.5" /> },
  { key: 'business', icon: <Briefcase className="size-3.5" /> },
  { key: 'traditionnel', icon: <Gem className="size-3.5" /> },
  { key: 'terrain', icon: <HardHat className="size-3.5" /> },
  { key: 'ceremonie', icon: <Crown className="size-3.5" /> },
];

const ACCESSORIES: Option<AvatarAccessory>[] = [
  { key: 'auto', icon: <Sparkles className="size-3.5" /> },
  { key: 'aucun', icon: <User className="size-3.5" /> },
  { key: 'casque', icon: <Headphones className="size-3.5" /> },
  { key: 'ordinateur', icon: <Laptop className="size-3.5" /> },
  { key: 'tablette', icon: <Tablet className="size-3.5" /> },
  { key: 'telephone', icon: <Smartphone className="size-3.5" /> },
  { key: 'documents', icon: <FileText className="size-3.5" /> },
  { key: 'badge', icon: <IdCard className="size-3.5" /> },
  { key: 'lunettes', icon: <Glasses className="size-3.5" /> },
];

const BACKGROUNDS: AvatarBackground[] = [
  'auto',
  'blanc',
  'beige',
  'gris',
  'violet',
  'bleu',
  'vert',
  'fonce',
];

interface AvatarConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expertKey: string;
  expertName: string;
  currentAvatarUrl: string | null;
  /** The portrait the member keeps: the caller makes it the expert's picture. */
  onApplyAvatar: (draft: ExpertAvatarDraft) => void;
}

export function AvatarConfigModal({
  open,
  onOpenChange,
  expertKey,
  expertName,
  currentAvatarUrl,
  onApplyAvatar,
}: AvatarConfigModalProps) {
  const [choice, setChoice] = useState<AgentAvatarConfig>(DEFAULT_AVATAR_CONFIG);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referenceUrl, setReferenceUrl] = useState<string | null>(null);
  const [draft, setDraftResult] = useState<ExpertAvatarDraft | null>(null);
  const generatedUrl = draft?.url ?? null;
  const [phase, setPhase] = useState<'compose' | 'generating' | 'ready' | 'failed'>('compose');
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // The preview of a picked photo lives as long as it is shown.
  useEffect(() => () => {
    if (referenceUrl) URL.revokeObjectURL(referenceUrl);
  }, [referenceUrl]);

  const pickReference = (file: File | null) => {
    if (file && file.size > MAX_UPLOAD_BYTES) {
      setError(TOO_LARGE);
      setPhase('failed');
      return;
    }
    setReferenceUrl(file ? URL.createObjectURL(file) : null);
    setReferenceFile(file);
    setDraftResult(null);
    setPhase('compose');
  };

  const patch = (part: Partial<AgentAvatarConfig>) => {
    setChoice((prev) => ({ ...prev, ...part }));
    if (phase === 'ready') {
      setPhase('compose');
    }
  };

  // The four choices and, if one was picked, the reference photo. The prompt is written by the back
  // office; the answer is a draft that becomes the expert's picture only when it is applied.
  const handleGenerate = async () => {
    setPhase('generating');
    setError(null);
    try {
      const form = new FormData();
      form.set('position', choice.position);
      form.set('style', choice.style);
      form.set('accessory', choice.accessory);
      form.set('background', choice.background);
      if (referenceFile) form.set('reference', referenceFile);
      setDraftResult(await apiFetch<ExpertAvatarDraft>(`/api/experts/${encodeURIComponent(expertKey)}/avatar/generate`, { method: 'POST', body: form }, 'Le portrait n’a pas pu être créé. Réessayez'));
      setPhase('ready');
    } catch (err) {
      setError((err as Error).message);
      setPhase('failed');
    }
  };

  const handleSave = () => {
    if (draft) onApplyAvatar(draft);
    onOpenChange(false);
  };

  const frameBackground = generatedUrl
    ? undefined
    : AVATAR_BACKGROUND_COLORS[choice.background];

  const shownAvatarSrc = generatedUrl ?? referenceUrl ?? currentAvatarUrl;

  const renderAxis = <T extends string>(
    label: string,
    options: Option<T>[],
    current: T,
    labels: Record<T, string>,
    apply: (key: T) => void,
    gridClass: string = 'grid-cols-4'
  ) => (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">
        {label}
      </span>
      <div className={cn("grid gap-1.5", gridClass)} role="radiogroup" aria-label={label}>
        {options.map((opt) => {
          const selected = current === opt.key;
          return (
            <button
              type="button"
              key={opt.key}
              role="radio"
              aria-checked={selected}
              onClick={() => apply(opt.key)}
              className={cn(
                'flex flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-1.5 text-center transition-all min-h-[48px] w-full overflow-hidden',
                selected
                  ? 'border-brand bg-brand/10 font-semibold text-brand shadow-xs'
                  : 'border-line bg-surface text-ink-2 hover:border-brand/40 hover:bg-soft'
              )}
            >
              <div className={cn(selected ? 'text-brand' : 'text-ink-3')}>{opt.icon}</div>
              <span className="w-full text-center text-[10.5px] leading-tight truncate px-0.5" title={labels[opt.key]}>
                {labels[opt.key]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl overflow-hidden p-0 sm:rounded-2xl">
        <DialogHeader className="border-b border-line px-5 py-4">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base font-bold text-ink">
              Portrait IA de {expertName}
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 p-5 md:grid-cols-[240px_minmax(0,1fr)] max-h-[75vh] overflow-y-auto">
          {/* Colonne gauche : Aperçu & Photo de référence */}
          <div className="flex flex-col gap-3">
            <div
              className="relative mx-auto aspect-[3/4] w-40 overflow-hidden rounded-2xl md:w-full border border-line shadow-inner flex items-center justify-center"
              style={{ backgroundColor: frameBackground }}
            >
              {shownAvatarSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={shownAvatarSrc}
                  alt={expertName}
                  className={cn(
                    'h-full w-full object-cover object-[50%_15%] transition-opacity duration-300',
                    phase === 'generating' ? 'opacity-30 blur-[1px]' : 'opacity-100'
                  )}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center text-sm font-semibold text-ink-2 hover:text-brand"
                >
                  <ImagePlus className="size-7" />
                  Ajouter une photo
                </button>
              )}

              {phase === 'generating' && (
                <div className="absolute inset-0 grid place-items-center bg-black/10">
                  <div className="flex flex-col items-center gap-2 rounded-xl bg-surface/90 px-3.5 py-2.5 shadow-md border border-line">
                    <Loader2 className="size-6 animate-spin text-brand" />
                    <span className="text-xs font-semibold text-ink">Création en cours…</span>
                  </div>
                </div>
              )}
            </div>

            {/* Sélecteur de photo source / référence */}
            <div className="flex flex-col gap-1.5">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={(e) => pickReference(e.target.files?.[0] ?? null)}
              />
              <div className="flex items-center gap-1.5">
                {/* The photo is optional (Leslie, 03/11: « on ne sait même pas qu'il faut télécharger une
                    photo »): said on the button, and what the studio starts from said under it. */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex min-h-11 flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-left text-sm font-semibold text-ink hover:border-brand/40 hover:bg-soft transition-colors"
                >
                  <ImagePlus className="size-4 shrink-0 text-brand" />
                  <span className="min-w-0 flex-1 truncate">
                    {referenceFile ? referenceFile.name : 'Partir d’une photo'}
                  </span>
                  {!referenceFile && <span className="shrink-0 text-xs font-medium text-ink-3">facultatif</span>}
                </button>
                {referenceFile && (
                  <button
                    type="button"
                    onClick={() => pickReference(null)}
                    title="Revenir à l'image d'origine"
                    className="grid size-11 shrink-0 place-items-center rounded-xl border border-line text-ink-3 hover:border-red-300 hover:bg-red-50 hover:text-red-600 transition-colors"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
              <p className="text-xs text-ink-3">
                {referenceFile
                  ? 'Le portrait gardera le visage de cette photo.'
                  : currentAvatarUrl
                    ? 'Sans photo, le portrait garde le visage actuel.'
                    : 'Ajoutez une photo : le portrait gardera son visage.'}
              </p>
            </div>

            {phase === 'failed' && (
              <p className="rounded-lg bg-red-50 p-2 text-xs text-red-600 border border-red-200">
                {error ?? 'La génération a échoué. Relancez-la.'}
              </p>
            )}
          </div>

          {/* Colonne droite : Les 4 axes de personnalisation */}
          <div className="flex flex-col gap-4">
            {renderAxis('Position', POSITIONS, choice.position, AVATAR_POSITION_LABELS, (k) => patch({ position: k }), 'grid-cols-4')}
            {renderAxis('Tenue', STYLES, choice.style, AVATAR_STYLE_LABELS, (k) => patch({ style: k }), 'grid-cols-4')}
            {renderAxis('Accessoire', ACCESSORIES, choice.accessory, AVATAR_ACCESSORY_LABELS, (k) => patch({ accessory: k }), 'grid-cols-3 sm:grid-cols-5')}

            {/* Axe Fond avec nuancier */}
            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">
                Fond
              </span>
              <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Fond">
                {BACKGROUNDS.map((bg) => {
                  const selected = choice.background === bg;
                  return (
                    <button
                      type="button"
                      key={bg}
                      role="radio"
                      aria-checked={selected}
                      onClick={() => patch({ background: bg })}
                      className={cn(
                        'flex flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-1.5 text-center transition-all min-h-[48px] w-full overflow-hidden',
                        selected
                          ? 'border-brand bg-brand/10 font-semibold text-brand shadow-xs'
                          : 'border-line bg-surface text-ink-2 hover:border-brand/40 hover:bg-soft'
                      )}
                    >
                      <span
                        className="size-3.5 rounded-full border border-black/15 shadow-2xs shrink-0"
                        style={{ backgroundColor: AVATAR_BACKGROUND_COLORS[bg] }}
                      />
                      <span className="w-full text-center text-[10.5px] leading-tight truncate px-0.5" title={AVATAR_BACKGROUND_LABELS[bg]}>
                        {AVATAR_BACKGROUND_LABELS[bg]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Pied de dialogue */}
        <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-line bg-surface/80 px-5 py-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={phase === 'generating'}
          >
            Annuler
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={handleGenerate}
            disabled={phase === 'generating'}
            className="border-brand/30 bg-surface font-semibold text-brand hover:bg-brand/10"
          >
            {phase === 'generating' ? (
              <>
                <Loader2 className="mr-1.5 size-4 animate-spin" />
                Génération…
              </>
            ) : (
              <>
                <Sparkles className="mr-1.5 size-4" />
                {phase === 'ready' ? 'Relancer' : 'Générer le portrait'}
              </>
            )}
          </Button>

          <Button
            type="button"
            onClick={handleSave}
            disabled={!generatedUrl || phase === 'generating'}
            className="font-semibold"
          >
            <Check className="mr-1.5 size-4" />
            Appliquer ce portrait
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
