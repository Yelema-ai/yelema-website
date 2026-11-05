"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { Loader2, Lock } from "lucide-react";
import { branding } from "@/config/branding";
import type { GuestView } from "@/lib/guest-access";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// The salon (thread, previews) is the heavy part: fetched in parallel with the session check, never before the code step.
const loadKeys = () => import("@/lib/buzz-keys");
const loadSalon = () => import("@/components/guest/GuestSalon").then((m) => m.GuestSalon);
const GuestSalon = dynamic(loadSalon, { ssr: false, loading: () => <Loader2 className="m-auto size-6 animate-spin text-ink-3" aria-label="Chargement" /> });

// La page d'une personne externe invitée dans un salon : son adresse, le code reçu par e-mail, puis le salon.
// La clé de messagerie est faite dans ce navigateur ; seule sa moitié publique part. Rien de l'app des membres ici.

type Step = { kind: "checking" } | { kind: "email" } | { kind: "code"; email: string } | { kind: "salon"; view: GuestView } | { kind: "ended" } | { kind: "invalid" };

const ENDED_STATUS = 410;

async function post(url: string, body: unknown): Promise<{ status: number; data: { error?: { message?: string } } & Partial<GuestView> }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

export function GuestEntry({ token }: { token: string }) {
  const [step, setStep] = useState<Step>({ kind: "checking" });
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Retour avec la session de ce navigateur : droit au salon. Sans la clé gardée ici, l'adresse et le code d'abord.
  useEffect(() => {
    let stop = false;
    const held = loadKeys().then((k) => k.storedGuestKey() !== null);
    void held.then((h) => (h ? loadSalon().then(() => undefined) : undefined)).catch(() => undefined);
    fetch("/invite/session", { headers: { "X-Invite-Token": token }, cache: "no-store" })
      .then(async (res) => {
        // Without the key kept here, a session alone cannot read the salon: address and code again.
        const hasKey = await held.catch(() => false);
        if (stop) return;
        if (res.ok && hasKey) return setStep({ kind: "salon", view: (await res.json()) as GuestView });
        setStep(res.status === ENDED_STATUS ? { kind: "ended" } : { kind: "email" });
      })
      .catch(() => !stop && setStep({ kind: "email" }));
    return () => {
      stop = true;
    };
  }, [token]);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    const mail = email.trim();
    if (!mail) return setError("Saisissez votre adresse e-mail.");
    setBusy(true);
    setError(null);
    try {
      const r = await post(`/invite/${token}/code`, { email: mail });
      if (r.status === ENDED_STATUS) return setStep({ kind: "ended" });
      if (r.status === 404) return setStep({ kind: "invalid" });
      if (r.status !== 202) return setError(r.data.error?.message ?? "Le code n’a pas pu être envoyé. Réessayez dans un instant.");
      setNotice(`Si ${mail} est l’adresse de l’invitation, un code à 6 chiffres vient de lui être envoyé. Il est valable 10 minutes.`);
      setCode("");
      setStep({ kind: "code", email: mail });
    } catch {
      setError("Le code n’a pas pu être envoyé. Réessayez dans un instant.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent, mail: string) {
    e.preventDefault();
    const digits = code.replace(/\s/g, "");
    if (!/^\d{6}$/.test(digits)) return setError("Le code fait 6 chiffres.");
    setBusy(true);
    setError(null);
    void loadSalon().catch(() => undefined);
    try {
      const r = await post(`/invite/${token}/verify`, { email: mail, code: digits, pubkey: (await loadKeys()).guestKey().pubkey });
      if (r.status === ENDED_STATUS) return setStep({ kind: "ended" });
      if (r.status === 404) return setStep({ kind: "invalid" });
      if (r.status !== 200) return setError(r.data.error?.message ?? "Le code n’a pas pu être vérifié. Réessayez dans un instant.");
      setStep({ kind: "salon", view: r.data as GuestView });
    } catch {
      setError("Le code n’a pas pu être vérifié. Réessayez dans un instant.");
    } finally {
      setBusy(false);
    }
  }

  if (step.kind === "salon") return <GuestSalon view={step.view} onEnded={() => setStep({ kind: "ended" })} onSignedOut={() => setStep({ kind: "email" })} />;

  return (
    <GuestCard>
      {step.kind === "checking" && <Loader2 className="mx-auto size-6 animate-spin text-ink-3" aria-label="Chargement" />}
      {step.kind === "ended" && <Heading title="Accès terminé">Votre accès à ce salon a pris fin.</Heading>}
      {step.kind === "invalid" && <Heading title="Invitation indisponible">Ce lien d’invitation n’est pas valable, ou n’existe plus.</Heading>}
      {step.kind === "email" && (
        <form onSubmit={sendCode} className="flex flex-col gap-5" noValidate>
          <Heading title="Rejoindre le salon">Vous avez été invité à un salon d’échanges. Confirmez votre adresse e-mail : nous vous envoyons un code.</Heading>
          <div className="flex flex-col gap-2">
            <Label htmlFor="guest-email">Adresse e-mail</Label>
            <Input id="guest-email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </div>
          {error && <p role="alert" className="rounded-xl bg-ko-pale px-4 py-3 text-sm text-ko">{error}</p>}
          <Button type="submit" disabled={busy} className="h-12">
            {busy && <Loader2 className="animate-spin" />} Recevoir un code
          </Button>
        </form>
      )}
      {step.kind === "code" && (
        <form onSubmit={(e) => void verify(e, step.email)} className="flex flex-col gap-5" noValidate>
          <Heading title="Saisissez le code">{notice}</Heading>
          <div className="flex flex-col gap-2">
            <Label htmlFor="guest-code">Code à 6 chiffres</Label>
            <Input
              id="guest-code"
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={7}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ""))}
              className="text-center text-xl tracking-[0.4em]"
              required
              autoFocus
            />
          </div>
          {error && <p role="alert" className="rounded-xl bg-ko-pale px-4 py-3 text-sm text-ko">{error}</p>}
          <Button type="submit" disabled={busy} className="h-12">
            {busy && <Loader2 className="animate-spin" />} Entrer dans le salon
          </Button>
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <button type="button" className="font-semibold text-brand-ink hover:underline" onClick={() => (setError(null), setStep({ kind: "email" }))}>
              Changer d’adresse
            </button>
            <button type="button" disabled={busy} className="font-semibold text-brand-ink hover:underline disabled:opacity-50" onClick={() => void sendCode()}>
              Renvoyer un code
            </button>
          </div>
        </form>
      )}
    </GuestCard>
  );
}

function Heading({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div>
      <h1 className="font-display text-[26px] font-bold tracking-tight text-ink">{title}</h1>
      {children ? <p className="mt-2 text-[15px] text-ink-2">{children}</p> : null}
    </div>
  );
}

function GuestCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <main className="flex w-full max-w-[440px] flex-col gap-6 rounded-[28px] bg-surface px-6 py-10 shadow-[0_40px_80px_-40px_rgba(23,17,43,.35)] sm:px-10">
        <span className="inline-flex w-fit rounded-xl bg-white px-3 py-2">
          <Image src={branding.logoUrl} alt={branding.appName} width={97} height={28} priority className="h-7 w-auto" />
        </span>
        {children}
        <p className="flex items-center gap-2 text-[13px] text-ink-3">
          <Lock className="size-4 shrink-0" aria-hidden />
          Accès personnel, limité à ce salon
        </p>
      </main>
    </div>
  );
}
