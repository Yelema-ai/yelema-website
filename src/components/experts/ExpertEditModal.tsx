"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ExpertImage } from "@/components/experts/ExpertImage";
import { AvatarConfigModal } from "./AvatarConfigModal";
import {
  Loader2,
  Sparkles,
  Upload,
  User,
  Building2,
  Palette,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

interface ExpertEditModalProps {
  expertKey: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface ExpertEditData {
  key: string;
  defaultName: string;
  displayName: string;
  role: string | null;
  avatarUrl: string;
  branding: {
    companyName: string;
    primaryColor: string;
    sector: string;
  };
}

export function ExpertEditModal({
  expertKey,
  open,
  onOpenChange,
  onSuccess,
}: ExpertEditModalProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<ExpertEditData | null>(null);
  const [name, setName] = useState("");
  const [currentAvatar, setCurrentAvatar] = useState("");
  const [avatarBase64, setAvatarBase64] = useState<string | null>(null);
  const [studioOpen, setStudioOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadExpert = () => {
    if (!expertKey) return;
    setLoading(true);
    setError(null);

    fetch(`/api/experts/${encodeURIComponent(expertKey)}`)
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(json?.error?.message || json?.error || "Impossible de charger les données de l'expert");
        }
        return json;
      })
      .then((json: unknown) => {
        const raw = json as Record<string, unknown> | null;
        const expert = (raw?.expert ?? raw) as ExpertEditData | null;
        if (expert && (expert.key || expert.defaultName)) {
          setData(expert);
          setName(expert.displayName || expert.defaultName || "");
          let av = expert.avatarUrl || "";
          if (av.includes('/api/media/file/')) av = av.replace('/api/media/file/', '/api/public/media/');
          setCurrentAvatar(av);
        } else {
          throw new Error("Format de réponse inattendu lors de la lecture du profil.");
        }
      })
      .catch((err) => {
        console.error("[ExpertEditModal] Error loading expert:", err);
        setError(err instanceof Error ? err.message : "Erreur lors du chargement des informations.");
      })
      .finally(() => setLoading(false));
  };

  // Charger les données de l'expert à l'ouverture
  useEffect(() => {
    if (!open) {
      setSuccessNotice(false);
      setError(null);
      return;
    }
    loadExpert();
  }, [expertKey, open]);

  // Gestion de l'upload local de photo
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError("L'image ne doit pas dépasser 5 Mo.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result as string;
      setAvatarBase64(b64);
      setCurrentAvatar(b64);
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  // Enregistrement des modifications
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/experts/${encodeURIComponent(expertKey)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: name.trim(),
          avatarUrl: currentAvatar,
          avatarBase64: avatarBase64 || undefined,
        }),
      });

      const resJson = await res.json();
      if (!res.ok || !resJson.ok) {
        throw new Error(resJson.error || "Erreur lors de la sauvegarde.");
      }

      setSuccessNotice(true);
      if (onSuccess) onSuccess();

      setTimeout(() => {
        onOpenChange(false);
      }, 700);
    } catch (err) {
      console.error("[ExpertEditModal] Save error:", err);
      setError(err instanceof Error ? err.message : "Erreur lors de la sauvegarde.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl overflow-hidden p-0 sm:rounded-2xl bg-surface border border-line">
          <DialogHeader className="border-b border-line px-6 py-4">
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-ink">
              <User className="size-4 text-brand" />
              Modifier l&apos;expert · {data?.defaultName || expertKey}
            </DialogTitle>
          </DialogHeader>

          {loading ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 p-8 text-ink-3">
              <Loader2 className="size-8 animate-spin text-brand" />
              <p className="text-xs font-medium">Chargement du profil de l&apos;expert…</p>
            </div>
          ) : error && !data ? (
            <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 p-8 text-center">
              <div className="grid size-10 place-items-center rounded-full bg-red-500/10 text-red-500">
                <AlertCircle className="size-5" />
              </div>
              <p className="text-xs text-red-400 max-w-sm">{error}</p>
              <Button variant="outline" size="sm" onClick={loadExpert} className="mt-2 text-xs">
                Réessayer
              </Button>
            </div>
          ) : data ? (
            <form onSubmit={handleSubmit} className="flex flex-col gap-5 p-6">
              {error && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
                  {error}
                </div>
              )}

              {successNotice && (
                <div className="flex items-center gap-2 rounded-xl border border-green-500/20 bg-green-500/10 p-3 text-xs font-semibold text-green-400">
                  <CheckCircle2 className="size-4 text-green-500 shrink-0" />
                  Modifications enregistrées avec succès !
                </div>
              )}

              {/* Nom personnalisé */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="expert-name" className="text-xs font-semibold text-ink-2">
                  Nom d&apos;affichage de l&apos;expert
                </Label>
                <Input
                  id="expert-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={60}
                  required
                  className="font-medium bg-soft/50 border-line text-ink"
                  placeholder="Ex: Koffi, Amina, Alex..."
                />
                <p className="text-xs text-ink-3">
                  Nom d&apos;origine : <span className="font-medium text-ink-2">{data.defaultName}</span>
                  {data.role && <> · Rôle : <span className="font-medium text-ink-2">{data.role}</span></>}
                </p>
              </div>

              {/* Photo / Avatar de l'agent */}
              <div className="flex flex-col gap-3">
                <Label className="text-xs font-semibold text-ink-2">
                  Photo / Avatar de l&apos;expert
                </Label>

                <div className="flex items-center gap-4 rounded-xl border border-line bg-soft/30 p-3.5 shadow-2xs">
                  <div className="relative size-20 shrink-0 overflow-hidden rounded-full border-2 border-brand/30 bg-[#8E6FB0] shadow-sm">
                    {currentAvatar ? (
                      <ExpertImage src={currentAvatar} size={80} className="h-full w-full object-cover object-[50%_15%]" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center font-bold text-white text-xl">
                        {name.trim()[0]?.toUpperCase() ?? "?"}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">{name || data.defaultName}</p>
                    <p className="text-xs text-ink-3">{data.role || "Expert métier"}</p>
                    <p className="mt-1 text-[11px] text-ink-3">
                      Visible dans vos discussions, les fiches de vos collaborateurs et dans le back-office.
                    </p>
                  </div>
                </div>

                {/* Section Studio Avatar IA (4 axes) */}
                <div className="rounded-2xl border border-brand/20 bg-brand/5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-brand text-on-brand shadow-xs">
                        <Sparkles className="size-4" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-ink">Studio Avatar IA</p>
                        <p className="text-xs text-ink-3">
                          Personnalisez les 4 axes : Position, Tenue, Accessoires et Fond tout en conservant le visage de l&apos;expert.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Badge Branding entreprise */}
                  {data.branding && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-surface px-2.5 py-1.5 text-xs text-ink-2 border border-line">
                      <Building2 className="size-3.5 text-brand" />
                      <span className="font-semibold text-ink">{data.branding.companyName}</span>
                      <span className="text-ink-3">·</span>
                      <span>{data.branding.sector}</span>
                      {data.branding.primaryColor && (
                        <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[11px] text-ink-3">
                          <span
                            className="inline-block size-2.5 rounded-full border border-black/10"
                            style={{ backgroundColor: data.branding.primaryColor }}
                          />
                          {data.branding.primaryColor}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Bouton pour ouvrir le studio de génération */}
                  <Button
                    type="button"
                    onClick={() => setStudioOpen(true)}
                    disabled={saving}
                    className="mt-3.5 w-full gap-2 border-brand/30 bg-brand font-semibold text-on-brand hover:bg-brand/90 shadow-xs"
                  >
                    <Palette className="size-4" />
                    Personnaliser l&apos;avatar dans le Studio IA
                  </Button>
                </div>

                {/* Importer une image manuelle */}
                <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-soft/30 p-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-ink">Importer une photo depuis l&apos;ordinateur</p>
                    <p className="text-[11px] text-ink-3">Formats acceptés : PNG, JPEG, WebP (max 5 Mo)</p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={saving}
                    className="shrink-0 gap-1.5 text-xs font-semibold text-ink-2 hover:bg-soft border-line"
                  >
                    <Upload className="size-3.5" />
                    Parcourir
                  </Button>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 border-t border-line pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                  disabled={saving}
                >
                  Annuler
                </Button>
                <Button type="submit" disabled={!name.trim() || saving}>
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Enregistrement…
                    </>
                  ) : (
                    "Enregistrer les modifications"
                  )}
                </Button>
              </div>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Modal Studio Avatar IA (les 4 axes) */}
      {data && (
        <AvatarConfigModal
          open={studioOpen}
          onOpenChange={setStudioOpen}
          expertKey={expertKey}
          expertName={name || data.defaultName}
          currentAvatarUrl={currentAvatar}
          onApplyAvatar={(newUrl) => {
            setCurrentAvatar(newUrl);
            setAvatarBase64(null);
          }}
        />
      )}
    </>
  );
}
