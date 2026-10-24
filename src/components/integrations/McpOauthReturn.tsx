"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { apiFetch } from "@/lib/api";

type Query = { code?: string; state?: string; iss?: string; error?: string };
type Outcome = { kind: "relaying" } | { kind: "connected"; name: string } | { kind: "failed"; message: string };

// The popup opened by « Autoriser » lands here. One relay only (React may run the effect twice in
// development); the MCP screen that opened it reads the new state on its own.
export function McpOauthReturn({ query }: { query: Query }) {
  const [outcome, setOutcome] = useState<Outcome>({ kind: "relaying" });
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    apiFetch<{ name: string; connected: boolean }>("/api/mcp/oauth/callback", { method: "POST", body: JSON.stringify(query) })
      .then((r) => {
        if (!r.connected) return setOutcome({ kind: "failed", message: query.error ? "L’autorisation a été refusée chez le fournisseur." : "L’autorisation n’a pas abouti. Relancez-la depuis l’écran MCP." });
        setOutcome({ kind: "connected", name: r.name });
        setTimeout(() => window.close(), 1500);
      })
      .catch((e: Error) => setOutcome({ kind: "failed", message: e.message }));
  }, [query]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <div role="status" className="w-full max-w-sm rounded-[22px] border border-line bg-surface p-6 text-center">
        {outcome.kind === "relaying" && (
          <>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand" />
            <p className="mt-3 text-sm font-semibold text-ink">Connexion du serveur à vos Experts…</p>
            <p className="mt-1 text-xs text-ink-3">Gardez cette fenêtre ouverte quelques secondes.</p>
          </>
        )}
        {outcome.kind === "connected" && (
          <>
            <CheckCircle2 className="mx-auto h-8 w-8 text-ok" />
            <p className="mt-3 text-sm font-semibold text-ink">Serveur {outcome.name} autorisé</p>
            <p className="mt-1 text-xs text-ink-3">Vos Experts peuvent utiliser ses outils. Cette fenêtre va se fermer.</p>
          </>
        )}
        {outcome.kind === "failed" && (
          <>
            <XCircle className="mx-auto h-8 w-8 text-ko" />
            <p className="mt-3 text-sm font-semibold text-ink">Autorisation non aboutie</p>
            <p className="mt-1 text-xs text-ink-3">{outcome.message}</p>
            <button type="button" onClick={() => window.close()} className="mt-4 text-xs font-semibold text-brand hover:underline">
              Fermer cette fenêtre
            </button>
          </>
        )}
      </div>
    </div>
  );
}
