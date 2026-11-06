"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SLOW_START_MS } from "@/components/channels/useTelegramHub";

// The manager bot's link, kept on screen while Telegram has not answered: a real link (never blocked like a
// popup), a copy to send elsewhere, and a QR for the phone — Telegram Web may not show the bot's button.
export function TelegramStartLink({ url, started, since, onCancel, busy }: { url: string; started: boolean; since: number | null; onCancel: () => void; busy: boolean }) {
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(url, { margin: 1, width: 224 }).then((d) => alive && setQr(d), () => undefined);
    return () => {
      alive = false;
    };
  }, [url]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const slow = !started && (since === null || now - since > SLOW_START_MS);
  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex flex-wrap items-start gap-4 rounded-[14px] bg-soft p-4">
      {qr && <img src={qr} alt="QR code du lien Telegram" className="h-28 w-28 shrink-0 rounded-md bg-white p-1" />}
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm text-ink-2">
          {started
            ? "Telegram a reçu la demande : dans la conversation, appuyez sur « Créer mon bot Yelema » puis confirmez."
            : "Dans Telegram : appuyez sur Démarrer, puis sur « Créer mon bot Yelema » et confirmez."}
        </p>
        {slow && (
          <p className="text-xs text-muted-foreground">
            Telegram n’a encore rien reçu. Si Telegram n’est pas installé sur cet ordinateur, scannez ce QR code avec votre
            téléphone, ou copiez le lien.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <a href={url} target="_blank" rel="noopener noreferrer">
              Ouvrir dans Telegram <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
          <Button variant="outline" size="sm" onClick={() => void copy()}>
            {copied ? <Check /> : <Copy />}
            {copied ? "Lien copié" : "Copier le lien"}
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            Annuler
          </Button>
        </div>
      </div>
    </div>
  );
}
