"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api";
import { AuthFrame } from "@/components/auth/AuthFrame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeNextPath } from "@/lib/site-url";

// Sign in with email + password. There is no public signup: the back office creates each client's
// first admin, and admins add their teammates from Paramètres › Équipe.
export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [forgotResult, setForgotResult] = useState<null | "sent" | "ask-admin">(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") !== "auth") return;
    toast.error("Ce lien n'est plus valable. Connectez-vous, ou demandez un nouveau lien à un admin.");
    params.delete("error");
    const qs = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
  }, []);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setLoading(false);
      toast.error(error.message === "Invalid login credentials" ? "E-mail ou mot de passe incorrect." : error.message);
      return;
    }
    window.location.assign(safeNextPath(new URLSearchParams(window.location.search).get("next")));
  }

  async function forgot(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { emailed } = await apiFetch<{ emailed: boolean }>("/api/acces/oubli", {
        method: "POST",
        body: JSON.stringify({ email: email.trim() }),
      });
      setForgotResult(emailed ? "sent" : "ask-admin");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthFrame>
      {mode === "signin" ? (
        <form onSubmit={signIn} className="space-y-5">
          <div>
            <h2 className="font-display text-[30px] font-bold tracking-tight text-ink">Connexion à votre espace</h2>
            <p className="mt-2 text-[15px] text-ink-2">Entrez vos identifiants pour retrouver vos experts.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Adresse e-mail</Label>
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Mot de passe</Label>
            <div className="relative">
              <Input
                id="password"
                type={show ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-12"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink"
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                setMode("forgot");
                setForgotResult(null);
              }}
              className="text-sm font-semibold text-link hover:underline"
            >
              Mot de passe oublié ?
            </button>
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : null}
            Se connecter {!loading && <ArrowRight />}
          </Button>
          <p className="text-center text-[13px] text-ink-3">
            Pas encore de compte ? Votre accès est créé par Yelema ou par un admin de votre entreprise.
          </p>
        </form>
      ) : (
        <form onSubmit={forgot} className="space-y-5">
          <div>
            <h2 className="font-display text-[30px] font-bold tracking-tight text-ink">Mot de passe oublié</h2>
            <p className="mt-2 text-[15px] text-ink-2">Nous vous envoyons un lien pour choisir un nouveau mot de passe.</p>
          </div>
          {forgotResult === "sent" ? (
            <p className="rounded-xl bg-ok-pale px-4 py-3 text-sm text-ok">
              Si un compte existe pour {email.trim()}, un e-mail avec votre lien vient de partir.
            </p>
          ) : forgotResult === "ask-admin" ? (
            <p className="rounded-xl bg-soft px-4 py-3 text-sm text-ink-2">
              L’envoi d’e-mails n’est pas encore activé. Demandez à un admin de votre équipe un lien de réinitialisation
              (Paramètres › Équipe).
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="forgot-email">Adresse e-mail</Label>
                <Input id="forgot-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <Button type="submit" size="lg" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="animate-spin" /> : null}
                Recevoir un lien
              </Button>
            </>
          )}
          <button type="button" onClick={() => setMode("signin")} className="w-full text-center text-sm font-semibold text-link hover:underline">
            Retour à la connexion
          </button>
        </form>
      )}
    </AuthFrame>
  );
}
