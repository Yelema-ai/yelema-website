"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Globe,
  Info,
  Lock,
  Mail,
  Plus,
  Share2,
  ShieldCheck,
  Users,
  X,
  Loader2,
  RefreshCw,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useDashboard, type ShareMode } from "./DashboardProvider";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { personToAdd } from "@/lib/dashboard-people";
import { DEFAULT_SHARE_EXPIRY, SHARE_EXPIRIES, shareExpiryOf, type ShareExpiry } from "@/lib/dashboard-expiry";
import { toast } from "sonner";

export function ShareDashboardModal() {
  const {
    shareModalOpen,
    setShareModalOpen,
    agentName,
    data,
    updateSharing,
    stopSharing,
    setShareExpiry,
  } = useDashboard();

  const workspaceCtx = useWorkspace();
  const shared = Boolean(data?.share);

  const [accesMode, setAccesMode] = useState<ShareMode>("team");
  const [emails, setEmails] = useState<string[]>([]);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [copied, setCopied] = useState(false);
  const [expiry, setExpiry] = useState<ShareExpiry>(DEFAULT_SHARE_EXPIRY);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Les membres de l'espace que le propriétaire peut choisir, tels que le back-office les donne
  const workspaceMembers = data?.candidates ?? [];

  // Saisie directe d'une adresse ; les membres ne sont suggérés que pendant la frappe.
  const [emailInput, setEmailInput] = useState("");
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const inputContainerRef = useRef<HTMLDivElement>(null);

  // Synchroniser avec les données actuelles quand la modale s'ouvre
  useEffect(() => {
    if (shareModalOpen && data) {
      setAccesMode(data.share?.mode ?? "team");
      setEmails(data.share?.people ?? []);
      setExpiry(data.shareExpiry ?? DEFAULT_SHARE_EXPIRY);
      setEmailInput("");
      setSuggestionsOpen(false);
      setSaveStatus("idle");
    }
  }, [shareModalOpen, data]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (inputContainerRef.current && !inputContainerRef.current.contains(event.target as Node)) {
        setSuggestionsOpen(false);
      }
    }
    if (suggestionsOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [suggestionsOpen]);

  // Enregistrement automatique et transparent en arrière-plan
  const persistSharing = async (mode: ShareMode, list: string[]) => {
    setSaveStatus("saving");
    const ok = await updateSharing(mode, list);
    if (ok) {
      setSaveStatus("saved");
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        setSaveStatus("idle");
      }, 2000);
    } else {
      setSaveStatus("idle");
    }
  };

  // Changement de mode de visibilité (enregistré immédiatement)
  const handleModeChange = (mode: ShareMode) => {
    setAccesMode(mode);
    void persistSharing(mode, emails);
  };

  // Always the platform link, sealed by the server: it names neither the instance nor the expert, and
  // every opening goes through the access check. Same origin as this page, so the client's sub-domain.
  const effectiveShareLink =
    typeof window !== "undefined" && data?.shareUrl ? `${window.location.origin}${data.shareUrl}` : "";

  const handleRegenerate = async () => {
    setSaveStatus("saving");
    const ok = await updateSharing(accesMode, emails, true);
    setSaveStatus(ok ? "saved" : "idle");
    if (ok) toast.success("Nouveau lien créé : l'ancien ne fonctionne plus.");
  };

  const handleExpiry = async (value: ShareExpiry) => {
    setExpiry(value);
    setSaveStatus("saving");
    const ok = await setShareExpiry(value);
    setSaveStatus(ok ? "saved" : "idle");
  };

  const expiresOn = data?.shareExpiresAt
    ? `Expire le ${new Date(data.shareExpiresAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`
    : "Sans date de fin";

  const handleStop = async () => {
    setSaveStatus("saving");
    const ok = await stopSharing();
    setSaveStatus("idle");
    if (ok) toast.success("Partage arrêté : le lien ne fonctionne plus.");
  };

  const handleCopy = () => {
    if (!effectiveShareLink) {
      toast.error("Aucun lien de tableau de bord disponible.");
      return;
    }
    navigator.clipboard.writeText(effectiveShareLink);
    setCopied(true);
    toast.success("Lien sécurisé copié dans le presse-papier !");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAddEmail = (raw: string) => {
    if (!raw.trim()) return;
    const verdict = personToAdd(raw, { chosen: emails, members: workspaceMembers, self: workspaceCtx?.userEmail });
    if (verdict.ok) {
      const updated = [...emails, verdict.email];
      setEmails(updated);
      void persistSharing(accesMode, updated);
    } else if (verdict.reason === "invalid") {
      return void toast.error("Saisissez une adresse e-mail valide.");
    } else if (verdict.reason === "outsider") {
      return void toast.info("Cette adresse n’est pas un membre de votre espace. Pour une personne hors entreprise, choisissez « Public ».");
    } else {
      toast.info(verdict.reason === "self" ? "Vous pouvez toujours ouvrir votre propre tableau de bord." : "Cette adresse est déjà dans la liste.");
    }
    setEmailInput("");
    setSuggestionsOpen(false);
  };

  const handleRemoveEmail = (emailToRemove: string) => {
    const updated = emails.filter((e) => e !== emailToRemove);
    setEmails(updated);
    void persistSharing(accesMode, updated);
  };

  // Calcul des destinataires pour l'envoi par email (mailto:)
  const emailRecipients = (() => {
    if (accesMode === "team") {
      return workspaceMembers
        .map((m) => m.email.trim())
        .filter(Boolean)
        .join(",");
    }
    if (accesMode === "people") {
      return emails.filter(Boolean).join(",");
    }
    return "";
  })();

  // The e-mail's template: the company's name, never a fixed one; the link first, then what it holds.
  const company = workspaceCtx?.current?.name?.trim() || "votre entreprise";
  const today = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  const mailtoSubject = encodeURIComponent(`Tableau de bord de ${agentName}, ${company} (${today})`);
  const mailtoBody = encodeURIComponent(
    `Bonjour,\n\nVoici le tableau de bord de ${agentName}, à jour au ${today}.\n\nPour l'ouvrir : ${effectiveShareLink}\n\nVous y trouverez les indicateurs du mois, l'avancement des projets et les points d'attention. Le lien s'ouvre avec votre compte ${company}.\n\nBonne lecture,\n${workspaceCtx?.userName || company}`
  );
  const mailtoHref = `mailto:${emailRecipients}?subject=${mailtoSubject}&body=${mailtoBody}`;

  const query = emailInput.toLowerCase().trim();
  const memberSuggestions = query
    ? workspaceMembers.filter(
        (m) => !emails.includes(m.email.toLowerCase().trim()) && (m.email.toLowerCase().includes(query) || Boolean(m.name?.toLowerCase().includes(query)))
      )
    : [];

  return (
    <Dialog open={shareModalOpen} onOpenChange={setShareModalOpen}>
      <DialogContent className="max-w-xl overflow-hidden rounded-2xl border border-line bg-surface p-0 shadow-2xl">
        <DialogHeader className="border-b border-line px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-brand/10 text-brand">
              <Share2 className="size-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold text-ink">
                Partager le tableau de bord
              </DialogTitle>
              <DialogDescription className="text-xs text-ink-3">
                Définissez qui peut accéder au tableau de bord en ligne et transmettez le lien à votre équipe.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[75vh] overflow-y-auto px-6 py-5 space-y-6">
          {/* Section 1 : Droits d'accès et visibilité (Enregistrement automatique) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-3">
                1. Visibilité &amp; Droits d’accès
              </h3>
              <div className="flex items-center gap-1.5 text-[11px]">
                {saveStatus === "saving" && (
                  <span className="flex items-center gap-1 text-ink-3">
                    <Loader2 className="size-3 animate-spin text-brand" />
                    Enregistrement…
                  </span>
                )}
                {saveStatus === "saved" && (
                  <span className="flex items-center gap-1 text-emerald-600 font-medium animate-in fade-in-0">
                    <Check className="size-3" />
                    Enregistré automatiquement
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {/* Option Public */}
              <button
                type="button"
                onClick={() => handleModeChange("link")}
                className={cn(
                  "flex flex-col items-start gap-1.5 rounded-xl border p-3.5 text-left transition-all",
                  accesMode === "link"
                    ? "border-brand bg-brand/5 shadow-xs ring-1 ring-brand/20"
                    : "border-line bg-card hover:border-line-2 hover:bg-soft"
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <div
                    className={cn(
                      "flex size-7 items-center justify-center rounded-lg",
                      accesMode === "link" ? "bg-brand text-white" : "bg-soft text-ink-2"
                    )}
                  >
                    <Globe className="size-3.5" />
                  </div>
                  {accesMode === "link" && <Check className="size-4 text-brand" />}
                </div>
                <div>
                  <p className="text-xs font-semibold text-ink">Public</p>
                  <p className="text-[11px] leading-snug text-ink-3">
                    Toute personne qui a le lien, sans connexion.
                  </p>
                </div>
              </button>

              {/* Option Workspace */}
              <button
                type="button"
                onClick={() => handleModeChange("team")}
                className={cn(
                  "flex flex-col items-start gap-1.5 rounded-xl border p-3.5 text-left transition-all",
                  accesMode === "team"
                    ? "border-brand bg-brand/5 shadow-xs ring-1 ring-brand/20"
                    : "border-line bg-card hover:border-line-2 hover:bg-soft"
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <div
                    className={cn(
                      "flex size-7 items-center justify-center rounded-lg",
                      accesMode === "team" ? "bg-brand text-white" : "bg-soft text-ink-2"
                    )}
                  >
                    <Users className="size-3.5" />
                  </div>
                  {accesMode === "team" && <Check className="size-4 text-brand" />}
                </div>
                <div>
                  <p className="text-xs font-semibold text-ink">Entreprise</p>
                  <p className="text-[11px] leading-snug text-ink-3">
                    Les membres connectés de votre espace.
                  </p>
                </div>
              </button>

              {/* Option Emails spécifiques */}
              <button
                type="button"
                onClick={() => handleModeChange("people")}
                className={cn(
                  "flex flex-col items-start gap-1.5 rounded-xl border p-3.5 text-left transition-all",
                  accesMode === "people"
                    ? "border-brand bg-brand/5 shadow-xs ring-1 ring-brand/20"
                    : "border-line bg-card hover:border-line-2 hover:bg-soft"
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <div
                    className={cn(
                      "flex size-7 items-center justify-center rounded-lg",
                      accesMode === "people" ? "bg-brand text-white" : "bg-soft text-ink-2"
                    )}
                  >
                    <Lock className="size-3.5" />
                  </div>
                  {accesMode === "people" && <Check className="size-4 text-brand" />}
                </div>
                <div>
                  <p className="text-xs font-semibold text-ink">E-mails</p>
                  <p className="text-[11px] leading-snug text-ink-3">
                    Les adresses que vous ajoutez, connectées.
                  </p>
                </div>
              </button>
            </div>

            {/* Note explicative pour le mode Workspace */}
            {accesMode === "team" && (
              <div className="flex items-start gap-2.5 rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 text-xs text-blue-700 dark:text-blue-300">
                <ShieldCheck className="size-4 shrink-0 mt-0.5 text-blue-500" />
                <p className="leading-relaxed">
                  <strong>Réservé à votre entreprise :</strong> seuls les membres connectés de votre espace ({workspaceMembers.length + 1} personnes) peuvent ouvrir ce lien. Les autres voient un écran de connexion.
                </p>
              </div>
            )}

            {/* Note explicative pour le mode Public */}
            {accesMode === "link" && (
              <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-700 dark:text-emerald-300">
                <Globe className="size-4 shrink-0 mt-0.5 text-emerald-500" />
                <p className="leading-relaxed">
                  <strong>Sans connexion :</strong> toute personne qui reçoit le lien peut l’ouvrir, y compris hors de votre entreprise. Régénérez ou arrêtez le partage pour le couper.
                </p>
              </div>
            )}

            {accesMode === "people" && (
              <div className="mt-3 space-y-3 rounded-xl border border-line bg-soft/40 p-4">
                <div>
                  <label htmlFor="share-email" className="text-xs font-semibold text-ink block mb-1">
                    Adresses e-mail autorisées
                  </label>
                  <p className="text-[11px] text-ink-3 mb-2">
                    Saisissez l’adresse d’un membre de votre espace : les suggestions apparaissent pendant la frappe.
                  </p>
                </div>

                <div ref={inputContainerRef} className="relative">
                  <div className="flex items-center gap-2">
                    <div className="relative flex flex-1 items-center">
                      <Mail className="absolute left-3 size-3.5 text-ink-4 pointer-events-none" />
                      <Input
                        id="share-email"
                        type="email"
                        autoComplete="off"
                        placeholder="prenom.nom@entreprise.com"
                        value={emailInput}
                        onChange={(e) => {
                          setEmailInput(e.target.value);
                          setSuggestionsOpen(true);
                        }}
                        onFocus={() => {
                          if (emailInput.trim()) setSuggestionsOpen(true);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddEmail(emailInput);
                          }
                        }}
                        className="h-9 pl-9 text-xs bg-surface border-line"
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleAddEmail(emailInput)}
                      disabled={!emailInput.trim()}
                      className="h-9 shrink-0 gap-1.5 px-3.5 text-xs font-medium"
                    >
                      <Plus className="size-3.5" />
                      Ajouter
                    </Button>
                  </div>

                  {suggestionsOpen && memberSuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 z-50 mt-1.5 overflow-hidden rounded-xl border border-line bg-surface shadow-xl animate-in fade-in-0 zoom-in-95">
                      <div className="border-b border-line bg-soft/60 px-3 py-1.5 text-[10.5px] font-medium text-ink-3">
                        Membres de votre espace
                      </div>
                      <div className="max-h-48 overflow-y-auto divide-y divide-line/40">
                        {memberSuggestions.map((m) => (
                          <button
                            type="button"
                            key={m.email}
                            onClick={() => handleAddEmail(m.email)}
                            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors hover:bg-soft"
                          >
                            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand text-[10px] font-bold uppercase">
                              {(m.name || m.email).charAt(0)}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate font-medium leading-tight text-ink">{m.name || m.email}</span>
                              <span className="block truncate text-[10.5px] leading-tight text-ink-3">{m.email}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {emails.length > 0 ? (
                  <div className="pt-1 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-ink-3">
                      <span>{emails.length} adresse{emails.length > 1 ? "s" : ""} autorisée{emails.length > 1 ? "s" : ""} :</span>
                      <button
                        type="button"
                        onClick={() => {
                          setEmails([]);
                          void persistSharing(accesMode, []);
                        }}
                        className="text-ink-4 hover:text-rose-500 transition-colors"
                      >
                        Tout effacer
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
                      {emails.map((e) => {
                        const member = workspaceMembers.find((m) => m.email.toLowerCase().trim() === e);
                        return (
                          <span
                            key={e}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs text-ink shadow-xs"
                          >
                            <span className="truncate max-w-[220px]">{member?.name ? `${member.name} (${e})` : e}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveEmail(e)}
                              className="text-ink-4 hover:text-rose-500 transition-colors ml-0.5"
                              title={`Retirer ${e}`}
                            >
                              <X className="size-3" />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-ink-4 italic">
                    Aucune adresse ajoutée : en attendant, tous les membres de votre espace peuvent l’ouvrir.
                  </p>
                )}

                <div className="flex items-start gap-2.5 rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 text-[11.5px] text-blue-800 dark:text-blue-300">
                  <Info className="size-4 shrink-0 mt-0.5 text-blue-500" />
                  <p className="leading-relaxed">
                    <strong>Une personne hors entreprise ?</strong> Clients, partenaires ou banquiers n’ont pas de compte dans votre espace : choisissez <strong>« Public »</strong> ou envoyez l’export <strong>PDF / HTML</strong>.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Section 2 : Lien de partage & transmission */}
          <div className="space-y-3 pt-3 border-t border-line">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-3">
                2. Lien de partage
              </h3>
              <span className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide",
                accesMode === "link"
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
              )}>
                {!shared ? "Pas encore partagé" : accesMode === "link" ? "Sans connexion" : "Connexion exigée"}
              </span>
            </div>

            {data?.sharing === false && (
              <p className="text-[11px] text-ink-3">Le partage n’est pas disponible sur cet espace.</p>
            )}
            {data?.sharing !== false && (
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <label htmlFor="share-expiry" className="font-medium text-ink">Validité du lien</label>
                  <select
                    id="share-expiry"
                    value={expiry}
                    onChange={(e) => void handleExpiry(shareExpiryOf(e.target.value))}
                    disabled={saveStatus === "saving"}
                    className="h-8 rounded-lg border border-line bg-surface px-2 text-xs text-ink"
                  >
                    {SHARE_EXPIRIES.map((x) => (
                      <option key={x} value={x}>{EXPIRY_LABELS[x]}</option>
                    ))}
                  </select>
                  {shared && effectiveShareLink && <span className="text-ink-3">{expiresOn}</span>}
                </div>
                {shared && (
                  <p className="text-[11px] text-ink-4">Un lien déjà envoyé garde sa date : régénérez-le pour le couper.</p>
                )}
              </div>
            )}
            {data?.sharing !== false && !shared && (
              <Button
                type="button"
                size="sm"
                onClick={() => void persistSharing(accesMode, emails)}
                disabled={saveStatus === "saving"}
                className="h-9 px-3 text-xs gap-1.5"
              >
                <Share2 className="h-3.5 w-3.5" />
                <span>Créer le lien de partage</span>
              </Button>
            )}
            {shared && (
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={effectiveShareLink || "Aucun tableau de bord généré pour le moment"}
                className="h-9 font-mono text-xs text-ink bg-soft/50 select-all"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopy}
                disabled={!effectiveShareLink}
                className="h-9 px-3 text-xs gap-1.5 shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Copié</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copier</span>
                  </>
                )}
              </Button>

              {effectiveShareLink && (
                <a
                  href={effectiveShareLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-card text-ink transition-colors hover:bg-soft shrink-0"
                  title="Ouvrir dans un nouvel onglet pour tester"
                >
                  <ExternalLink className="size-3.5" />
                </a>
              )}
              {effectiveShareLink && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRegenerate}
                  disabled={saveStatus === "saving"}
                  className="h-9 px-3 text-xs gap-1.5 shrink-0"
                  title="Créer un nouveau lien ; l'ancien cessera de fonctionner"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Régénérer</span>
                </Button>
              )}
            </div>
            )}
            {shared && (
              <button
                type="button"
                onClick={() => void handleStop()}
                disabled={saveStatus === "saving"}
                className="text-[11px] text-ink-3 hover:text-rose-500 hover:underline"
              >
                Arrêter le partage
              </button>
            )}

            {shared && accesMode !== "link" && (
              <p className="text-[11px] text-ink-3 leading-relaxed">
                🛡️ <strong>Protection active :</strong> à chaque ouverture, la plateforme vérifie qui ouvre le lien. Une personne non connectée ou non autorisée est arrêtée.
              </p>
            )}

            {/* Bouton Partager par e-mail avec affichage clair des destinataires */}
            <div className="rounded-xl border border-line bg-card p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail className="size-4 text-brand" />
                  <span className="text-xs font-semibold text-ink">
                    Transmettre par e-mail
                  </span>
                </div>
                <a
                  href={mailtoHref}
                  className={cn(
                    "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-brand px-3 text-xs font-medium text-white transition-colors hover:bg-brand/90 shrink-0",
                    !effectiveShareLink && "pointer-events-none opacity-50"
                  )}
                  title="Ouvrir votre logiciel de messagerie avec les destinataires pré-remplis"
                >
                  <Mail className="size-3.5" />
                  <span>Envoyer un e-mail</span>
                </a>
              </div>

              <div className="text-[11.5px] text-ink-3 leading-relaxed">
                {accesMode === "team" && (
                  <p>
                    Destinataires pré-remplis : <strong>Tous les membres de votre espace</strong> ({workspaceMembers.length} adresses : {workspaceMembers.map((m) => m.email).slice(0, 3).join(", ")}{workspaceMembers.length > 3 ? "…" : ""}).
                  </p>
                )}
                {accesMode === "people" && (
                  <p>
                    Destinataires pré-remplis : {emails.length > 0 ? (
                      <strong>{emails.length} adresse{emails.length > 1 ? "s" : ""} sélectionnée{emails.length > 1 ? "s" : ""} ({emails.slice(0, 3).join(", ")}{emails.length > 3 ? "…" : ""})</strong>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400">Aucun destinataire sélectionné ci-dessus.</span>
                    )}
                  </p>
                )}
                {accesMode === "link" && (
                  <p>
                    Destinataires : libre (à saisir dans votre client email).
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const EXPIRY_LABELS: Record<ShareExpiry, string> = { "7": "7 jours", "30": "30 jours", "90": "90 jours", none: "Sans fin" };
