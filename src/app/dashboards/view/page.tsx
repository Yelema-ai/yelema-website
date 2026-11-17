"use client";

import { useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import {
  Download,
  ExternalLink,
  FileCode,
  FileText,
  Globe,
  LayoutDashboard,
  Loader2,
  Lock,
  Maximize2,
  Minimize2,
  RefreshCw,
  ShieldAlert,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SharedDashboardResponse {
  ok: boolean;
  mode?: "team" | "people" | "link";
  lien?: string;
  maj?: string;
  title?: string;
  description?: string;
  pdfUrl?: string | null;
  htmlUrl?: string | null;
  reason?: "login_required" | "forbidden" | "not_found" | "expired";
  message?: string;
  currentUserEmail?: string | null;
  error?: string;
}

export default function SharedDashboardViewPage() {
  const searchParams = useSearchParams();
  const shareToken = searchParams.get("s");

  const [data, setData] = useState<SharedDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const fetchSharedDashboard = async () => {
    if (!shareToken) {
      setLoading(false);
      setData({ ok: false, error: "Lien de partage incomplet." });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        `/api/dashboards/shared?s=${encodeURIComponent(shareToken)}`,
        { cache: "no-store" }
      );
      const json: SharedDashboardResponse = await res.json();
      setData(json);
    } catch (err) {
      setData({
        ok: false,
        error: "Erreur de connexion au serveur lors de la vérification des accès.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSharedDashboard();
  }, [shareToken]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const handleDownloadPdf = () => {
    if (data?.pdfUrl) {
      const a = document.createElement("a");
      a.href = data.pdfUrl;
      a.download = "tableau-de-bord.pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
      window.print();
    }
  };

  const handleDownloadHtml = async () => {
    if (data?.htmlUrl) {
      const a = document.createElement("a");
      a.href = data.htmlUrl;
      a.download = "tableau-de-bord.html";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else if (data?.lien) {
      // Si aucun fichier HTML statique n'est disponible sur l'instance, ouvrir le tableau
      window.open(data.lien, "_blank", "noopener,noreferrer");
    }
  };

  // 1. État chargement
  if (loading) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-slate-950 text-slate-200">
        <Loader2 className="h-10 w-10 animate-spin text-orange-500 mb-4" />
        <p className="text-sm font-medium tracking-wide text-slate-400">
          Vérification des accès et chargement du tableau de bord...
        </p>
      </div>
    );
  }

  // 2. État Connexion requise (Workspace ou Emails)
  if (data?.reason === "login_required") {
    const returnUrl = encodeURIComponent(
      typeof window !== "undefined" ? window.location.pathname + window.location.search : ""
    );
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-950 p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/90 p-8 shadow-2xl backdrop-blur-xl text-center">
          <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400 ring-1 ring-orange-500/20">
            <Lock className="size-7" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Connexion requise</h1>
          <p className="text-sm text-slate-400 mb-6 leading-relaxed">
            {data.error || "Ce tableau de bord est réservé à votre entreprise. Connectez-vous pour l’ouvrir."}
          </p>
          <div className="space-y-3">
            <Button
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-medium shadow-lg shadow-orange-500/20"
              onClick={() => {
                window.location.href = `/login?next=${returnUrl}`;
              }}
            >
              Se connecter
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // 3. État Accès refusé (Non autorisé)
  if (data?.reason === "forbidden") {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-950 p-4">
        <div className="w-full max-w-md rounded-2xl border border-rose-900/40 bg-slate-900/90 p-8 shadow-2xl backdrop-blur-xl text-center">
          <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-400 ring-1 ring-rose-500/20">
            <ShieldAlert className="size-7" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Accès restreint</h1>
          <p className="text-sm text-slate-300 mb-6 leading-relaxed">
            {data.error || "Ce tableau de bord n’est pas partagé avec vous."}
          </p>
          {data.currentUserEmail && (
            <div className="mb-6 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-400">
              Connecté en tant que <span className="font-semibold text-slate-200">{data.currentUserEmail}</span>
            </div>
          )}
          <div className="flex gap-2 justify-center">
            <Button
              variant="outline"
              className="border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200"
              onClick={() => {
                window.location.href = "/login";
              }}
            >
              Changer de compte
            </Button>
            <Button
              className="bg-orange-500 hover:bg-orange-600 text-white"
              onClick={() => window.location.reload()}
            >
              Réessayer
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // 4. État Erreur générale ou non trouvé
  if (!data?.ok || !data?.lien) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-950 p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/90 p-8 shadow-2xl text-center">
          <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-slate-800 text-slate-400">
            <LayoutDashboard className="size-7" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">{data?.reason === "expired" ? "Lien expiré" : "Tableau de bord indisponible"}</h1>
          <p className="text-sm text-slate-400 mb-6">
            {data?.error || "Le tableau de bord demandé n'a pas encore été généré ou le lien est expiré."}
          </p>
          <Button
            variant="outline"
            className="border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200"
            onClick={() => window.location.reload()}
          >
            Actualiser la page
          </Button>
        </div>
      </div>
    );
  }

  // 5. Affichage du tableau de bord interactif avec bandeau supérieur
  const embedUrl = data.lien;

  return (
    <div className="flex h-screen w-screen flex-col bg-slate-950 overflow-hidden font-sans">
      {/* Barre d'en-tête professionnelle */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-800/80 bg-slate-900/90 px-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-orange-500 text-white font-bold text-xs shadow-md shadow-orange-500/20">
            M
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold text-white tracking-tight">
                {data.title || "Tableau de bord métier"}
              </h1>
              {data.mode === "link" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 ring-1 ring-emerald-500/20">
                  <Globe className="size-2.5" /> Public
                </span>
              )}
              {data.mode === "team" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-400 ring-1 ring-blue-500/20">
                  <Users className="size-2.5" /> Entreprise
                </span>
              )}
              {data.mode === "people" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium text-purple-400 ring-1 ring-purple-500/20">
                  <Lock className="size-2.5" /> E-mails
                </span>
              )}
            </div>
            {data.description && (
              <p className="text-[11px] text-slate-400 truncate max-w-md hidden sm:block">
                {data.description}
              </p>
            )}
          </div>
        </div>

        {/* Contrôles & Téléchargement */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadPdf}
            className="h-8 border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs gap-1.5 shadow-sm"
            title="Télécharger la version PDF officielle"
          >
            <FileText className="size-3.5 text-orange-400" />
            <span className="hidden sm:inline">PDF</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadHtml}
            className="h-8 border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs gap-1.5 shadow-sm"
            title="Télécharger le document HTML autonome"
          >
            <FileCode className="size-3.5 text-blue-400" />
            <span className="hidden sm:inline">HTML</span>
          </Button>

          {data.mode === "link" && (
            <a
              href={data.lien}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 text-xs text-slate-200 hover:bg-slate-700 transition-colors"
              title="Ouvrir directement dans un nouvel onglet"
            >
              <ExternalLink className="size-3.5" />
            </a>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleFullscreen}
            className="h-8 w-8 text-slate-300 hover:text-white hover:bg-slate-800"
            title={isFullscreen ? "Quitter le plein écran" : "Plein écran"}
          >
            {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </Button>
        </div>
      </header>

      {/* Frame principale */}
      <main className="flex-1 w-full bg-slate-900 relative">
        <iframe
          src={embedUrl}
          title={data.title || "Tableau de bord"}
          className="h-full w-full border-0 bg-transparent"
          sandbox="allow-scripts allow-popups allow-downloads"
        />
      </main>
    </div>
  );
}
