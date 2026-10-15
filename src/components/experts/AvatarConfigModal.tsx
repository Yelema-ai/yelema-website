'use client';

import React, { useState, useRef } from 'react';
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
  currentAvatarUrl: string;
  onApplyAvatar: (newAvatarUrl: string) => void;
}

export function AvatarConfigModal({
  open,
  onOpenChange,
  expertKey,
  expertName,
  currentAvatarUrl,
  onApplyAvatar,
}: AvatarConfigModalProps) {
  const [draft, setDraft] = useState<AgentAvatarConfig>(DEFAULT_AVATAR_CONFIG);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referenceUrl, setReferenceUrl] = useState<string | null>(null);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<'compose' | 'generating' | 'ready' | 'failed'>('compose');
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const pickReference = (file: File | null) => {
    if (referenceUrl) URL.revokeObjectURL(referenceUrl);
    setReferenceUrl(file ? URL.createObjectURL(file) : null);
    setReferenceFile(file);
    setGeneratedUrl(null);
    setPhase('compose');
  };

  const patch = (part: Partial<AgentAvatarConfig>) => {
    setDraft((prev) => ({ ...prev, ...part }));
    if (phase === 'ready') {
      setPhase('compose');
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleGenerate = async () => {
    setPhase('generating');
    setError(null);

    try {
      let referenceBase64: string | undefined;
      if (referenceFile) {
        referenceBase64 = await fileToBase64(referenceFile);
      }

      const res = await fetch(`/api/experts/${encodeURIComponent(expertKey)}/avatar/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          position: draft.position,
          style: draft.style,
          accessory: draft.accessory,
          background: draft.background,
          referenceBase64,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        const errorMsg =
          (typeof data?.error === 'string' && data.error) ||
          data?.error?.message ||
          data?.message ||
          'Erreur lors de la génération de l’avatar.';
        throw new Error(errorMsg);
      }

      setGeneratedUrl(data.avatarUrl);
      setPhase('ready');
    } catch (err) {
      console.error('[AvatarConfigModal] Generation error:', err);
      setError(err instanceof Error ? err.message : 'Échec de la génération. Veuillez réessayer.');
      setPhase('failed');
    }
  };

  const handleSave = () => {
    if (generatedUrl) {
      onApplyAvatar(generatedUrl);
    }
    onOpenChange(false);
  };

  const frameBackground = generatedUrl
    ? undefined
    : AVATAR_BACKGROUND_COLORS[draft.background];

  const shownAvatarSrc = generatedUrl ?? referenceUrl ?? currentAvatarUrl;

  const renderAxis = <T extends string>(
    label: string,
    options: Option<T>[],
    current: T,
    labels: Record<T, string>,
    apply: (key: T) => void
  ) => (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">
        {label}
      </span>
      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8" role="radiogroup" aria-label={label}>
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
                'flex flex-col items-center justify-center gap-1 rounded-lg border p-1.5 text-center transition-all min-h-[46px]',
                selected
                  ? 'border-brand bg-brand/10 font-semibold text-brand shadow-xs'
                  : 'border-line bg-surface text-ink-2 hover:border-brand/40 hover:bg-soft'
              )}
            >
              <div className={cn(selected ? 'text-brand' : 'text-ink-3')}>{opt.icon}</div>
              <span className="text-[10.5px] leading-tight">{labels[opt.key]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl overflow-hidden p-0 sm:rounded-2xl">
        <DialogHeader className="border-b border-line px-5 py-4">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base font-bold text-ink">
              Portrait IA de {expertName}
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-6 p-5 md:grid-cols-[240px_1fr] max-h-[75vh] overflow-y-auto">
          {/* Colonne gauche : Aperçu & Photo de référence */}
          <div className="flex flex-col gap-3">
            <div
              className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl border border-line shadow-inner flex items-center justify-center"
              style={{ backgroundColor: frameBackground }}
            >
              {shownAvatarSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={shownAvatarSrc}
                  alt={expertName}
                  crossOrigin="anonymous"
                  className={cn(
                    'h-full w-full object-cover object-[50%_15%] transition-opacity duration-300',
                    phase === 'generating' ? 'opacity-30 blur-[1px]' : 'opacity-100'
                  )}
                />
              ) : (
                <div className="flex flex-col items-center justify-center p-4 text-center text-xs text-ink-3">
                  Aucun portrait disponible
                </div>
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
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-dashed border-line bg-soft/50 px-2.5 py-1.5 text-xs text-ink-2 hover:border-brand/40 hover:bg-soft hover:text-brand transition-colors"
                >
                  <ImagePlus className="size-3.5 shrink-0" />
                  <span className="truncate">
                    {referenceFile ? referenceFile.name : 'Photo de référence'}
                  </span>
                </button>
                {referenceFile && (
                  <button
                    type="button"
                    onClick={() => pickReference(null)}
                    title="Revenir à l'image d'origine"
                    className="grid size-7 shrink-0 place-items-center rounded-lg border border-line text-ink-3 hover:border-red-300 hover:bg-red-50 hover:text-red-600 transition-colors"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
              <p className="text-[10.5px] text-ink-3">
                {referenceFile
                  ? 'Généré en préservant le visage de ce fichier.'
                  : 'Généré en préservant le visage du portrait actuel.'}
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
            {renderAxis('Position', POSITIONS, draft.position, AVATAR_POSITION_LABELS, (k) => patch({ position: k }))}
            {renderAxis('Tenue', STYLES, draft.style, AVATAR_STYLE_LABELS, (k) => patch({ style: k }))}
            {renderAxis('Accessoire', ACCESSORIES, draft.accessory, AVATAR_ACCESSORY_LABELS, (k) => patch({ accessory: k }))}

            {/* Axe Fond avec nuancier */}
            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">
                Fond
              </span>
              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8" role="radiogroup" aria-label="Fond">
                {BACKGROUNDS.map((bg) => {
                  const selected = draft.background === bg;
                  return (
                    <button
                      type="button"
                      key={bg}
                      role="radio"
                      aria-checked={selected}
                      onClick={() => patch({ background: bg })}
                      className={cn(
                        'flex flex-col items-center justify-center gap-1 rounded-lg border p-1.5 text-center transition-all min-h-[46px]',
                        selected
                          ? 'border-brand bg-brand/10 font-semibold text-brand shadow-xs'
                          : 'border-line bg-surface text-ink-2 hover:border-brand/40 hover:bg-soft'
                      )}
                    >
                      <span
                        className="size-3.5 rounded-full border border-black/15 shadow-2xs"
                        style={{ backgroundColor: AVATAR_BACKGROUND_COLORS[bg] }}
                      />
                      <span className="text-[10.5px] leading-tight">{AVATAR_BACKGROUND_LABELS[bg]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Pied de dialogue */}
        <div className="flex items-center justify-end gap-2.5 border-t border-line bg-surface/80 px-5 py-3">
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
