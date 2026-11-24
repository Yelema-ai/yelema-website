"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, CircleAlert, Info, Mail } from "lucide-react";
import { useSupabase } from "@/lib/supabase/client";
import { usePublicConfig } from "@/components/PublicConfigProvider";
import { AuthShell, AuthHeading } from "@/components/auth/AuthShell";
import { CodeStep } from "@/components/auth/CodeStep";
import { Field, PasswordField } from "@/components/auth/Field";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { readApiError } from "@/lib/api";
import { wipeDevice } from "@/lib/device-cache-client";
import { googleErrorMessage } from "@/lib/signin-steps";
import { publicSiteOrigin, safeNextPath } from "@/lib/site-url";
import { toast } from "sonner";

// Pas d'inscription ici : chaque compte est créé par le back-office Yelema, qui envoie
// son lien d'accès. Quatre écrans : connexion, code de vérification, demande de lien, lien envoyé.
type Mode = "signin" | "code" | "forgot" | "sent";

// The code step's answer to a sign-in: its own mode, not an error.
const ASKS_CODE = "mfa_required";

// POST to one of this app's /api/auth routes; the message to show when it refuses (or ASKS_CODE), else null.
async function post(path: string, body: unknown): Promise<string | null> {
  try {
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.status === 403 && (await res.clone().json().catch(() => null))?.error?.code === ASKS_CODE) return ASKS_CODE;
    return res.ok ? null : await readApiError(res, "Une erreur est survenue. Réessayez dans un instant.");
  } catch {
    return "Connexion impossible. Vérifiez votre réseau, puis réessayez.";
  }
}

const RESEND_DELAY = 30;

export default function LoginPage() {
  const supabase = useSupabase();
  // Signed out (or the session ended): nothing of the last account stays on this device.
  useEffect(() => void wipeDevice(), []);
  const { siteUrl } = usePublicConfig();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [expired, setExpired] = useState(false);
  const [reauth, setReauth] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const sentTo = useRef("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // Retour de déconnexion : on le dit, plutôt que de rendre un formulaire muet.
    if (params.get("out") === "1" || window.location.hash.startsWith("#out")) setSignedOut(true);
    // Sent here by a call refused in the middle of a page (see lib/api): say why.
    if (params.get("expired") === "1") setExpired(true);
    // /auth/callback renvoie ici avec ?error=auth quand un lien a expiré, a déjà servi,
    // ou a été ouvert dans un autre navigateur.
    if (params.get("error") === "auth") {
      toast.error("Ce lien n’est plus valable. Connectez-vous, ou demandez-en un nouveau.");
    }
    if (params.get("error") === "google") setError(googleErrorMessage(params.get("reason")));
    // A session opened without its code, where one is now required.
    if (params.get("reauth") === "1") setReauth(true);
    if (params.has("error") || params.has("out") || params.has("expired") || params.has("reauth")) {
      for (const k of ["error", "reason", "out", "expired", "reauth"]) params.delete(k);
      const qs = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
  }, []);

  // A sign-in waiting for its code (Google return, renewal, new password): this screen asks for it.
  useEffect(() => {
    if (supabase) return;
    fetch("/api/auth/mfa")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { pending?: boolean } | null) => d?.pending && setMode("code"))
      .catch(() => undefined);
  }, [supabase]);

  // Compte à rebours avant de pouvoir redemander un lien.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  function go(next: Mode) {
    setMode(next);
    setPassword("");
    setError(null);
  }

  function callbackUrl(next: string): string {
    const url = new URL("/auth/callback", publicSiteOrigin(siteUrl, window.location.origin));
    url.searchParams.set("next", next);
    return url.toString();
  }

  async function sendResetLink(mail: string) {
    setLoading(true);
    let failure: string | null = null;
    if (supabase) {
      const { error: err } = await (await supabase()).auth.resetPasswordForEmail(mail, {
        redirectTo: callbackUrl("/reset-password"),
      });
      failure = err?.message ?? null;
    } else {
      // The back office sends the link, and answers the same whether or not the account exists.
      failure = await post("/api/auth/forgot", { email: mail });
    }
    setLoading(false);
    if (failure) return toast.error(failure);
    sentTo.current = mail;
    setCooldown(RESEND_DELAY);
    setMode("sent");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const mail = email.trim();
    if (!mail) return;

    if (mode === "forgot") return sendResetLink(mail);

    if (!password) return;
    setLoading(true);
    setError(null);
    let failure: string | null = null;
    if (supabase) {
      const { error: err } = await (await supabase()).auth.signInWithPassword({ email: mail, password });
      failure = err ? "Adresse ou mot de passe incorrect." : null;
    } else {
      // Through the back office: it says a wrong password, a suspended access, or too many tries.
      failure = await post("/api/auth/login", { email: mail, password });
    }
    setLoading(false);
    if (failure === ASKS_CODE) return go("code");
    if (failure) {
      setError(failure);
      return;
    }
    enter();
  }

  // Navigation dure : les cookies de session fraîchement écrits partent avec la requête suivante.
  function enter() {
    window.location.href = safeNextPath(new URLSearchParams(window.location.search).get("next"));
  }

  if (mode === "code") {
    return (
      <AuthShell>
        <CodeStep
          onDone={enter}
          onRestart={(message) => {
            go("signin");
            setError(message);
          }}
        />
      </AuthShell>
    );
  }

  if (mode === "sent") {
    return (
      <AuthShell>
        <span className="grid size-12 place-items-center rounded-2xl bg-tint text-brand-ink">
          <Mail className="size-6" />
        </span>
        <AuthHeading title="Vérifiez vos emails">
          Un lien vient de partir vers <b className="text-ink">{sentTo.current}</b>. Il reste
          valable 24 heures.
        </AuthHeading>

        <div className="flex items-start gap-2.5 rounded-xl bg-soft px-3.5 py-3 text-[13.5px] text-ink-2">
          <Info className="mt-px size-4 shrink-0 text-ink-3" />
          <span>Rien reçu ? Regardez dans les courriers indésirables, ou vérifiez l’adresse.</span>
        </div>

        <p className="text-[13px] text-ink-2">
          Pas de lien ?{" "}
          <button
            type="button"
            disabled={cooldown > 0 || loading}
            onClick={() => sendResetLink(sentTo.current)}
            className="font-semibold text-link disabled:text-ink-3"
          >
            Renvoyer le lien
          </button>
          {cooldown > 0 ? <span className="text-ink-3"> (dans {cooldown} s)</span> : null}
        </p>
        <p className="text-[13px]">
          <button type="button" onClick={() => go("forgot")} className="font-semibold text-link">
            Changer d’adresse
          </button>
        </p>
      </AuthShell>
    );
  }

  const forgot = mode === "forgot";

  return (
    <AuthShell>
      {expired && !forgot ? (
        <p className="rounded-xl bg-soft px-3.5 py-3 text-sm font-semibold text-ink-2">
          Votre session a expiré. Reconnectez-vous pour reprendre où vous en étiez.
        </p>
      ) : null}
      {reauth && !forgot ? (
        <p className="rounded-xl bg-soft px-3.5 py-3 text-sm font-semibold text-ink-2">
          Pour continuer, reconnectez-vous avec votre code de vérification.
        </p>
      ) : null}
      {signedOut && !forgot ? (
        <p className="flex items-center gap-2 rounded-xl bg-ok-pale px-3.5 py-3 text-sm font-semibold text-ok">
          <CheckCircle2 className="size-4 shrink-0" />
          Vous êtes déconnecté. À bientôt.
        </p>
      ) : null}

      <AuthHeading title={forgot ? "Mot de passe oublié" : "Connexion à votre espace"}>
        {forgot
          ? "Indiquez votre adresse email. Nous vous envoyons un lien pour en choisir un nouveau."
          : "Entrez vos identifiants pour retrouver vos Experts."}
      </AuthHeading>

      {error ? (
        <p role="alert" className="flex items-start gap-2.5 rounded-xl bg-ko-pale px-3.5 py-3 text-[13.5px] text-ko">
          <CircleAlert className="mt-px size-4 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}

      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <Field
          label="Adresse email"
          type="email"
          autoComplete="username"
          placeholder="vous@entreprise.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        {!forgot && (
          <>
            <PasswordField
              label="Mot de passe"
              autoComplete="current-password"
              placeholder="Votre mot de passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <div className="flex justify-end text-sm">
              <button type="button" onClick={() => go("forgot")} className="font-semibold text-link">
                Mot de passe oublié ?
              </button>
            </div>
          </>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-1 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand px-6 text-[15px] font-semibold text-on-brand transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading
            ? forgot
              ? "Envoi…"
              : "Connexion…"
            : forgot
              ? "Recevoir le lien"
              : "Se connecter"}
          <ArrowRight className="size-[18px]" />
        </button>
      </form>

      {!forgot && !supabase ? (
        <>
          <div className="flex items-center gap-3 text-xs text-ink-3" aria-hidden="true">
            <span className="h-px flex-1 bg-line" />
            ou
            <span className="h-px flex-1 bg-line" />
          </div>
          <GoogleButton />
        </>
      ) : null}

      {forgot ? (
        <p className="text-center text-[13px]">
          <button type="button" onClick={() => go("signin")} className="font-semibold text-link">
            Retour à la connexion
          </button>
        </p>
      ) : (
        <p className="text-center text-xs text-ink-3">
          Besoin d’un accès ? Demandez à votre administrateur de vous inviter.
        </p>
      )}
    </AuthShell>
  );
}
