"use client";

import { useEffect, useState } from "react";
import { useSupabase } from "@/lib/supabase/client";
import { usePublicConfig } from "@/components/PublicConfigProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { branding } from "@/config/branding";
import { publicSiteOrigin, safeNextPath } from "@/lib/site-url";
import { toast } from "sonner";

// No sign-up here: every account is created by the Yelema back-office, which sends its access link.
type Mode = "signin" | "reset";

const COPY: Record<Mode, { title: string; subtitle: string; cta: string; busy: string }> = {
  signin: { title: "Sign in", subtitle: "Welcome back.", cta: "Sign in", busy: "Signing in..." },
  reset: { title: "Reset password", subtitle: "We'll email you a link to set a new password.", cta: "Send reset link", busy: "Sending..." },
};

export default function LoginPage() {
  const supabase = useSupabase();
  const { siteUrl } = usePublicConfig();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [sentEmail, setSentEmail] = useState("");

  // /auth/callback bounces here with ?error=auth when a confirmation/recovery link
  // fails (expired, already used, or opened in a different browser). Surface it —
  // otherwise the user lands on a pristine form with no clue the link broke.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") !== "auth") return;
    toast.error("That link is invalid or has expired. Sign in, or request a new one.");
    params.delete("error");
    const qs = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
  }, []);

  function switchMode(next: Mode) {
    setMode(next);
    setPassword("");
    setSent(false);
  }

  // /auth/callback exchanges the email link for a session, then redirects to `next`.
  function callbackUrl(next: string): string {
    const url = new URL("/auth/callback", publicSiteOrigin(siteUrl, window.location.origin));
    url.searchParams.set("next", next);
    return url.toString();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const mail = email.trim();
    if (!mail) return;

    const next = safeNextPath(new URLSearchParams(window.location.search).get("next"));

    if (mode === "reset") {
      setLoading(true);
      const { error } = await supabase.auth.resetPasswordForEmail(mail, {
        redirectTo: callbackUrl("/reset-password"),
      });
      setLoading(false);
      if (error) return toast.error(error.message);
      setSentEmail(mail);
      setSent(true);
      return;
    }

    if (!password) return;

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: mail, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    // Hard navigation so the freshly written auth cookies ride along on the next request.
    window.location.href = next;
  }

  const copy = COPY[mode];

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">{branding.appName}</h1>
          <p className="text-sm text-muted-foreground">{copy.subtitle}</p>
        </div>

        {sent ? (
          <div className="space-y-4">
            <div className="rounded-lg border bg-card p-6 text-center text-sm">
              <p className="font-medium">Check your email</p>
              <p className="mt-1 text-muted-foreground">
                We sent a password reset link to{" "}
                <span className="font-medium text-foreground">{sentEmail}</span>.
              </p>
            </div>
            <button
              type="button"
              onClick={() => switchMode("signin")}
              className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {mode !== "reset" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  {mode === "signin" && (
                    <button
                      type="button"
                      onClick={() => switchMode("reset")}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? copy.busy : copy.cta}
            </Button>

            <div className="text-center text-sm text-muted-foreground">
              {mode === "reset" && (
                <button type="button" onClick={() => switchMode("signin")} className="hover:text-foreground">
                  Back to sign in
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
