"use client";

import { useState } from "react";
import { ArrowRight, CircleAlert, ShieldCheck } from "lucide-react";
import { AuthHeading } from "@/components/auth/AuthShell";
import { Field } from "@/components/auth/Field";

// The sign-in's second step: six digits from the authenticator app. The ticket stays in its server cookie.
// `onRestart`: the ticket is spent or expired, back to the first step with that sentence.
export function CodeStep({ onDone, onRestart }: { onDone: () => void; onRestart: (message: string | null) => void }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/mfa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      if (res.ok) return onDone();
      const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
      const message = body?.error?.message ?? "Une erreur est survenue. Réessayez dans un instant.";
      if (body?.error?.code === "mfa_ticket_invalid") return onRestart(message);
      setError(message);
      setCode("");
    } catch {
      setError("Connexion impossible. Vérifiez votre réseau, puis réessayez.");
    } finally {
      setLoading(false);
    }
  }

  async function cancel() {
    await fetch("/api/auth/mfa", { method: "DELETE" }).catch(() => undefined);
    onRestart(null);
  }

  return (
    <>
      <span className="grid size-12 place-items-center rounded-2xl bg-tint text-brand-ink">
        <ShieldCheck className="size-6" />
      </span>
      <AuthHeading title="Code de vérification">
        Ouvrez votre application d’authentification et entrez le code à 6 chiffres affiché pour votre compte.
      </AuthHeading>

      {error ? (
        <p role="alert" className="flex items-start gap-2.5 rounded-xl bg-ko-pale px-3.5 py-3 text-[13.5px] text-ko">
          <CircleAlert className="mt-px size-4 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}

      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <Field
          label="Code à 6 chiffres"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          maxLength={7}
          placeholder="123 456"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^0-9 ]/g, ""))}
          invalid={Boolean(error)}
          aria-invalid={Boolean(error)}
          autoFocus
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="mt-1 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand px-6 text-[15px] font-semibold text-on-brand transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Vérification…" : "Valider"}
          <ArrowRight className="size-[18px]" />
        </button>
      </form>

      <p className="text-center text-[13px]">
        <button type="button" onClick={cancel} className="font-semibold text-link">
          Retour à la connexion
        </button>
      </p>
    </>
  );
}
