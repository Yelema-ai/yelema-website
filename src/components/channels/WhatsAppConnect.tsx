"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { isChannelConnected, type MessagingPlatform, type WhatsappPairingState } from "@/lib/channels";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WhatsAppIcon } from "@/components/channels/BrandIcons";
import { Steps } from "@/components/channels/TelegramConnect";
import { useAsyncAction } from "@/components/useAsyncAction";

const POLL_MS = 2500;

// WhatsApp on the business chat (the instance's default Hermes profile), shown in the Canaux dialog.
// It links a phone instead of taking a token: the instance opens a WhatsApp session and prints the
// same QR code the phone app expects, and this panel relays it. The code rotates every few seconds, so
// the poll that watches for a scan also refreshes what is on screen.
//
// The linked number becomes the whole allowlist and the chat is the owner's own "message yourself"
// thread, which is the one setup that needs no second phone.
export function WhatsAppConnect({
  agentId,
  channel,
  onChanged,
  onClose,
}: {
  agentId: string;
  channel: MessagingPlatform;
  onChanged: () => void;
  onClose: () => void;
}) {
  const [session, setSession] = useState<WhatsappPairingState | null>(
    isChannelConnected(channel) ? { pairing_id: "", status: "connected" } : null
  );
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { busy, run } = useAsyncAction();
  // Starting a second pairing on the same instance cancels the first, so React's two strict-mode
  // mounts must share ONE start or the screen shows the code that just died.
  const started = useRef<Promise<WhatsappPairingState> | null>(null);

  const alreadyConnected = isChannelConnected(channel);

  useEffect(() => {
    if (alreadyConnected) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    setError(null);

    const pair = (body: Record<string, unknown>) =>
      apiFetch<WhatsappPairingState>(`/api/agents/${agentId}/channels/whatsapp`, {
        method: "POST",
        body: JSON.stringify({ action: "pair", ...body }),
      });

    const land = (result: WhatsappPairingState) => {
      if (cancelled) return;
      setSession(result);
      if (result.status === "connected") {
        toast.success("WhatsApp est connecté");
        onChanged();
        return;
      }
      if (result.status === "linking") return;
      if (result.status === "expired") {
        setError("Ce code a expiré. Recommencez.");
        return;
      }
      timer = setTimeout(() => void poll(result.pairing_id), POLL_MS);
    };

    const fail = (cause: unknown) => {
      if (cancelled) return;
      setSession(null);
      setError((cause as Error).message);
    };

    // Saving a landed scan is a second call, so it goes out before the panel gets a say: closing the
    // dialog on a scan that already worked must not leave the number unsaved.
    const settle = (result: WhatsappPairingState) => {
      if (result.status === "linking") void poll(result.pairing_id, true);
      land(result);
    };

    const poll = async (pairingId: string, finish = false) => {
      try {
        settle(await pair({ pairing_id: pairingId, ...(finish ? { finish: true } : {}) }));
      } catch (cause) {
        fail(cause);
      }
    };

    if (!started.current) started.current = pair({});
    started.current.then((result) => !cancelled && settle(result)).catch(fail);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, attempt, alreadyConnected]);

  const disconnect = () =>
    run(async () => {
      await apiFetch(`/api/agents/${agentId}/channels/whatsapp`, { method: "DELETE" });
      toast.success("WhatsApp est déconnecté");
      onClose();
    });

  const retry = () => {
    started.current = null;
    setSession(null);
    setAttempt((v) => v + 1);
  };

  return (
    <div className="space-y-5">
      <DialogHeader className="flex-row items-center gap-3 space-y-0 text-left">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-soft">
          <WhatsAppIcon className="h-6 w-6" style={{ color: "#25D366" }} />
        </span>
        <div className="min-w-0 space-y-1">
          <DialogTitle className="font-display text-xl font-bold text-ink">WhatsApp</DialogTitle>
          <DialogDescription className="text-[13px] text-ink-3">Votre numéro WhatsApp, relié au chat entreprise.</DialogDescription>
        </div>
      </DialogHeader>

      {session?.status === "connected" ? (
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-xl bg-ok-pale px-3.5 py-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-ok" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-ink">
                {session.phone ? `+${session.phone} est connecté.` : "WhatsApp est connecté."}
              </p>
              <p className="text-[13px] text-ink-2">
                Dans WhatsApp, ouvrez la discussion avec vous-même et écrivez-y : c’est le chat entreprise qui répond.
                Personne d’autre ne peut lui écrire.
              </p>
            </div>
          </div>
          <Button variant="ghost" className="text-ko hover:text-ko" onClick={disconnect} disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            Déconnecter
          </Button>
        </div>
      ) : error ? (
        <div className="space-y-3">
          <p className="rounded-xl bg-ko-pale px-3 py-2 text-sm text-ko">{error}</p>
          <Button onClick={retry}>Réessayer</Button>
        </div>
      ) : session?.status === "linking" ? (
        <div className="flex items-center gap-2 py-6 text-sm text-ink-3">
          <Loader2 className="h-4 w-4 animate-spin" />
          Code scanné. Enregistrement en cours, environ une minute.
        </div>
      ) : session?.status === "waiting" && session.qr_data_url ? (
        <div className="space-y-4">
          <Steps
            items={[
              <>Sur votre téléphone, ouvrez WhatsApp.</>,
              <>
                Allez dans <span className="font-semibold text-ink">Réglages, Appareils connectés, Connecter un appareil</span>.
              </>,
              <>Scannez le code ci-dessous.</>,
            ]}
          />
          <div className="flex flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={session.qr_data_url}
              alt="Code QR pour relier WhatsApp"
              className="h-56 w-56 rounded-xl border border-line bg-white p-2"
            />
            <p className="flex items-center gap-2 text-[13px] text-ink-3">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              En attente du scan
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-10">
          <Loader2 className="h-5 w-5 animate-spin text-ink-3" />
          <p className="text-[13px] text-ink-3">Préparation du code. La première fois prend une minute.</p>
        </div>
      )}
    </div>
  );
}
