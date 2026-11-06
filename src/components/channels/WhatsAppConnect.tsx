"use client";

import { usePoll, WAIT_POLL_MS } from "@/components/usePoll";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { isChannelConnected, type MessagingPlatform, type WhatsappPairingState } from "@/lib/channels";
import { Button } from "@/components/ui/button";
import { ChannelPanelHeader } from "@/components/channels/ChannelCredentialsForm";
import { useAsyncAction } from "@/components/useAsyncAction";
import { DisconnectButton } from "@/components/channels/DisconnectButton";


// WhatsApp links a phone instead of taking a token: the agent opens a WhatsApp session and prints the
// same QR code the phone app expects, and this panel relays it. The code rotates every few seconds, so
// the poll that watches for a scan also refreshes what is on screen.
//
// The linked number becomes the whole allowlist and the chat is the owner's own "Message yourself"
// thread, which is the one setup that needs no second phone.
export function WhatsAppConnect({
  agentId,
  channel,
  onBack,
}: {
  agentId: string;
  channel: MessagingPlatform;
  onBack: () => void;
}) {
  const [session, setSession] = useState<WhatsappPairingState | null>(
    isChannelConnected(channel) ? { pairing_id: "", status: "connected" } : null
  );
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { busy, run } = useAsyncAction();
  // Starting a second pairing on the same agent cancels the first, so React's two strict-mode mounts
  // must share ONE start or the screen shows the code that just died.
  const started = useRef<Promise<WhatsappPairingState> | null>(null);

  const alreadyConnected = isChannelConnected(channel);
  // The next look at the pairing under way (usePoll times it); null while none is due.
  const look = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    if (alreadyConnected) return;

    let cancelled = false;
    // The pairing the next look is for; null while a look is out or none is due.
    let waiting: string | null = null;
    setError(null);

    const pair = (body: Record<string, unknown>) =>
      apiFetch<WhatsappPairingState>(`/api/agents/${agentId}/channels/whatsapp`, {
        method: "POST",
        body: JSON.stringify({ action: "pair", ...body }),
      });

    const land = (result: WhatsappPairingState) => {
      if (cancelled) return;
      setSession(result);
      if (result.status === "connected" || result.status === "linking") return;
      if (result.status === "expired") {
        setError("Ce code a expiré. Recommencez.");
        return;
      }
      waiting = result.pairing_id;
    };

    const fail = (cause: unknown) => {
      if (cancelled) return;
      setSession(null);
      setError((cause as Error).message);
    };

    // Saving a landed scan is a second call, so it goes out before the panel gets a say: closing the tab
    // on a scan that already worked must not leave the number unapplied.
    const settle = (result: WhatsappPairingState) => {
      if (result.status === "linking") void poll(result.pairing_id, true);
      land(result);
    };

    const poll = async (pairingId: string, finish = false) => {
      if (cancelled) return;
      waiting = null;
      try {
        settle(await pair({ pairing_id: pairingId, ...(finish ? { finish: true } : {}) }));
      } catch (cause) {
        fail(cause);
      }
    };

    if (!started.current) started.current = pair({});
    started.current.then((result) => !cancelled && settle(result)).catch(fail);

    look.current = () => (waiting ? poll(waiting) : Promise.resolve());
    return () => {
      cancelled = true;
      look.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, attempt, alreadyConnected]);

  // Hidden: the code is not asked again until the tab shows (the save of a scan still goes out).
  usePoll(() => look.current?.(), { enabled: !alreadyConnected, everyMs: WAIT_POLL_MS, immediate: false, runOnShow: true, wake: { types: ["job.done"], kind: "channels" } });

  const disconnect = () =>
    run(async () => {
      await apiFetch(`/api/agents/${agentId}/channels/whatsapp`, { method: "DELETE" });
      toast.success("WhatsApp déconnecté");
      onBack();
    });

  const retry = () => {
    started.current = null;
    setSession(null);
    setAttempt((v) => v + 1);
  };

  return (
    <div className="space-y-5">
      <ChannelPanelHeader channel={channel} onBack={onBack} />

      {session?.status === "connected" ? (
        <div className="space-y-4">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {session.phone ? `+${session.phone} est connecté.` : "WhatsApp est connecté."}
              </p>
              <p className="text-xs text-muted-foreground">
                Dans WhatsApp, ouvrez la conversation avec vous-même et écrivez-y à vos Experts. Personne d’autre ne
                peut les joindre.
              </p>
            </div>
          </div>
          <DisconnectButton name="WhatsApp" onConfirm={disconnect} disabled={busy} />
        </div>
      ) : error ? (
        <div className="space-y-3">
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
          <Button onClick={retry}>Réessayer</Button>
        </div>
      ) : session?.status === "linking" ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Scan reçu. Enregistrement en cours, environ une minute.
        </div>
      ) : session?.status === "waiting" && session.qr_data_url ? (
        <div className="space-y-4">
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>Sur votre téléphone, ouvrez WhatsApp.</li>
            <li>
              Allez dans <span className="font-medium text-foreground">Réglages › Appareils connectés › Connecter un appareil</span>.
            </li>
            <li>Pointez votre téléphone vers le code ci-dessous.</li>
          </ol>
          <div className="flex flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={session.qr_data_url}
              alt="QR code de connexion à WhatsApp"
              className="h-56 w-56 rounded-md bg-white p-2"
            />
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              En attente de votre scan
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Préparation de votre code. La première fois prend une minute.</p>
        </div>
      )}
    </div>
  );
}
