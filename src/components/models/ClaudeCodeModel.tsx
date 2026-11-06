"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowUp, ExternalLink, KeyRound, Loader2, LogIn, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { CLAUDE_CODE_RE, describeClaudeAuth, KIND_LABELS, LOGIN_FAILURES, safeLoginUrl, secretKind, usageByExpert, type ClaudeAuthStatus, type ClaudeCredential, type ClaudeLogin, type ClaudeUsage } from "@/lib/claude-code-auth";

// Intégrations · Modèles d'une instance Claude Code : l'abonnement Claude du membre (adresse à ouvrir,
// puis le code que Claude affiche), et des comptes en liste — clés API, jetons d'abonnement — qui servent
// dans l'ordre, le suivant prenant la main quand l'un est à court. Rien n'est gardé ici ni au back-office.
export function ClaudeCodeModel({ status, member, picker, onChanged }: { status: ClaudeAuthStatus; member: string | null; picker?: React.ReactNode; onChanged: () => Promise<void> }) {
  const query = member ? `?member=${encodeURIComponent(member)}` : "";
  const [login, setLogin] = useState<ClaudeLogin | null>(status.login?.state === "waiting_code" ? status.login : null);
  const [code, setCode] = useState("");
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState<"start" | "code" | "key" | "remove" | "order" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setLogin(status.login?.state === "waiting_code" ? status.login : null), [status.login]);

  const run = useCallback(async (what: NonNullable<typeof busy>, fn: () => Promise<void>) => {
    setBusy(what);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }, []);

  const start = () =>
    run("start", async () => {
      const out = await apiFetch<ClaudeLogin>(`/api/claude-code/auth${query}`, { method: "POST" });
      setLogin(out);
      const url = safeLoginUrl(out.url);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    });

  const submit = () =>
    run("code", async () => {
      const out = await apiFetch<ClaudeLogin>(`/api/claude-code/auth/code${query}`, { method: "POST", body: JSON.stringify({ code: code.trim() }) });
      if (out.state === "done") {
        toast.success("Abonnement Claude connecté");
        setLogin(null);
        setCode("");
        await onChanged();
      } else if (out.state === "failed") {
        setLogin(null);
        setError(LOGIN_FAILURES[out.reason ?? ""] ?? LOGIN_FAILURES.login_failed!);
      } else {
        toast("Vérification en cours…");
        await onChanged();
      }
    });

  const saveKey = () =>
    run("key", async () => {
      await apiFetch(`/api/claude-code/auth/key${query}`, { method: "PUT", body: JSON.stringify({ key: key.trim(), label: label.trim() || undefined }) });
      toast.success(secretKind(key.trim()) === "oauth_token" ? "Clé d’abonnement ajoutée" : "Clé Anthropic ajoutée");
      setKey("");
      setLabel("");
      await onChanged();
    });

  const remove = (what: "subscription" | ClaudeCredential) =>
    run("remove", async () => {
      await apiFetch(what === "subscription" ? `/api/claude-code/auth${query}` : `/api/claude-code/auth/key${query}${query ? "&" : "?"}id=${what.id}`, { method: "DELETE" });
      toast.success(what === "subscription" ? "Abonnement déconnecté" : "Compte retiré");
      await onChanged();
    });

  const credentials = status.credentials ?? [];
  const raise = (id: string) =>
    run("order", async () => {
      const ids = credentials.map((c) => c.id);
      const at = ids.indexOf(id);
      if (at > 0) [ids[at - 1], ids[at]] = [ids[at]!, ids[at - 1]!];
      await apiFetch(`/api/claude-code/auth/order${query}`, { method: "PUT", body: JSON.stringify({ ids }) });
      await onChanged();
    });

  const url = safeLoginUrl(login?.url);
  const subscribed = status.auth.loggedIn && status.auth.method === "claude.ai";

  return (
    <section className="space-y-4 rounded-[22px] border border-line bg-surface p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">Modèle de vos Experts</h2>
          <p className="text-xs text-ink-3">
            En service : <span className="font-semibold text-ink">{describeClaudeAuth(status)}</span>
          </p>
        </div>
        {picker}
      </header>

      <div className="space-y-3 rounded-2xl border border-line p-4">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-ink">
          <LogIn className="h-4 w-4 text-brand" /> Abonnement Claude (Pro, Max, Team, Enterprise)
        </div>
        {login && url ? (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (CLAUDE_CODE_RE.test(code.trim())) void submit();
              else setError(LOGIN_FAILURES.bad_code!);
            }}
          >
            <p className="text-xs text-ink-3">
              Connectez-vous sur la page de Claude, puis collez ici le code qu’elle affiche.{" "}
              <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand hover:underline">
                Rouvrir la page <ExternalLink className="h-3 w-3" />
              </a>
            </p>
            <div className="flex gap-2">
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Collez le code" autoComplete="off" spellCheck={false} className="font-mono text-xs" autoFocus />
              <Button type="submit" disabled={busy !== null || !code.trim()}>{busy === "code" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Valider"}</Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={() => void start()} disabled={busy !== null}>
              {busy === "start" ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Démarrage…</> : subscribed ? "Reconnecter" : "Se connecter avec Claude"}
            </Button>
            {subscribed && <Button type="button" variant="outline" onClick={() => void remove("subscription")} disabled={busy !== null}>Déconnecter</Button>}
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-2xl border border-line p-4">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-ink">
          <KeyRound className="h-4 w-4 text-brand" /> Comptes : clés Anthropic et clés d’abonnement
        </div>
        <p className="text-xs text-ink-3">
          Ils servent dans cet ordre, avant l’abonnement connecté. Quand l’un atteint sa limite, le suivant prend la main jusqu’à sa reprise. Une clé d’abonnement se crée depuis votre ordinateur avec la commande <code className="rounded bg-soft px-1">claude setup-token</code>, à demander à votre équipe tech.
        </p>
        {credentials.length > 0 && (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {credentials.map((c, i) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
                <span>
                  <span className="font-semibold text-ink">{c.label ?? KIND_LABELS[c.kind]}</span>
                  <span className="text-ink-3"> ({KIND_LABELS[c.kind]}, se termine par {c.last4})</span>
                  {c.exhaustedUntil && Date.parse(c.exhaustedUntil) > Date.now() && <span className="ml-2 rounded-full bg-ko-pale px-2 py-0.5 text-ko">À court jusqu’à {new Date(c.exhaustedUntil).toLocaleString("fr-FR", { weekday: "short", hour: "2-digit", minute: "2-digit" })}</span>}
                </span>
                <span className="flex gap-1">
                  {i > 0 && <Button type="button" size="sm" variant="ghost" aria-label="Monter" onClick={() => void raise(c.id)} disabled={busy !== null}><ArrowUp className="h-3.5 w-3.5" /></Button>}
                  <Button type="button" size="sm" variant="ghost" aria-label="Retirer" onClick={() => void remove(c)} disabled={busy !== null}><Trash2 className="h-3.5 w-3.5" /></Button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {credentials.length < 10 && (
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (secretKind(key.trim())) void saveKey();
              else setError("Collez une clé Anthropic (sk-ant-api…) ou une clé d’abonnement (sk-ant-oat…).");
            }}
          >
            <Input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-ant-api03-… ou sk-ant-oat01-…" autoComplete="off" spellCheck={false} className="min-w-[14rem] flex-1 font-mono text-xs" />
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nom (facultatif)" maxLength={60} className="w-40 text-xs" />
            <Button type="submit" variant="outline" disabled={busy !== null || !key.trim()}>{busy === "key" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ajouter"}</Button>
          </form>
        )}
      </div>

      <UsageCard query={query} />

      {error && <p role="alert" className="rounded-xl bg-ko-pale px-3 py-2 text-xs text-ko">{error}</p>}
    </section>
  );
}

// Ce que l'instance a consommé ce mois-ci, par expert : le client paie son compte, on ne fait que mesurer.
function UsageCard({ query }: { query: string }) {
  const [usage, setUsage] = useState<ClaudeUsage | null>(null);
  useEffect(() => {
    let live = true;
    apiFetch<ClaudeUsage>(`/api/claude-code/auth/usage${query}`).then((u) => live && setUsage(u), () => live && setUsage(null));
    return () => void (live = false);
  }, [query]);
  if (!usage?.rows.length) return null;
  const lines = usageByExpert(usage.rows);
  const cost = lines.reduce((n, l) => n + l.costUsd, 0);
  return (
    <div className="space-y-2 rounded-2xl border border-line p-4 text-xs">
      <p className="text-[13px] font-semibold text-ink">Consommation du mois</p>
      <p className="text-ink-3">Dépense estimée sur vos comptes Claude : {cost.toLocaleString("fr-FR", { style: "currency", currency: "USD" })}. Yelema ne la refacture pas.</p>
      <ul className="space-y-1">
        {lines.map((l) => (
          <li key={l.profile} className="flex justify-between gap-2">
            <span className="text-ink">{l.profile || "Sans Expert"}</span>
            <span className="text-ink-3">{l.turns.toLocaleString("fr-FR")} échanges, {l.tokens.toLocaleString("fr-FR")} jetons, {l.costUsd.toLocaleString("fr-FR", { style: "currency", currency: "USD" })}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
