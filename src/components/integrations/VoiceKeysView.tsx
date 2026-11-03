"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, KeyRound, Loader2, Mic, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ScopePicker } from "@/components/models/ScopePicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import type { SettingScope } from "@/lib/llm";
import { cn } from "@/lib/utils";
import type { VoiceKey, VoiceKeysOverview } from "@/lib/voice-keys";

const scopeUrl = (scope: SettingScope) => (scope.kind === "member" ? `/api/voice/keys/members/${encodeURIComponent(scope.id)}` : `/api/voice/keys/${scope.kind}`);

// Intégrations · Voix : la clé de transcription que le client apporte (Groq, OpenAI…), pour ses
// dictées et ses notes vocales — pas pour les appels. Mêmes portées que les clés de modèle ; la clé
// part au back-office, qui la vérifie et la garde, et ne revient ici que par sa fin.
export function VoiceKeysView() {
  const [data, setData] = useState<VoiceKeysOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<SettingScope>({ kind: "own" });
  const [provider, setProvider] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<VoiceKey | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await apiFetch<VoiceKeysOverview>("/api/voice/keys"));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const admin = data?.members !== undefined;
  useEffect(() => {
    if (data) setScope((s) => (admin ? (s.kind === "own" ? { kind: "client" } : s) : { kind: "own" }));
  }, [data, admin]);

  const keys = (scope.kind === "client" ? data?.client : scope.kind === "member" ? data?.members?.find((m) => m.id === scope.id)?.keys : data?.own) ?? [];
  const labelOf = (id: string) => data?.providers?.find((p) => p.id === id)?.label ?? id;
  const chosen = data?.providers?.find((p) => p.id === provider);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!provider || !secret.trim() || busy) return;
    setBusy(true);
    try {
      const out = await apiFetch<{ ok: true; verified: boolean }>(scopeUrl(scope), { method: "PUT", body: JSON.stringify({ provider, secret: secret.trim() }) });
      setSecret("");
      await load();
      toast.success(`Clé ${labelOf(provider)} enregistrée`, { description: out.verified ? "Acceptée par le fournisseur." : "Le fournisseur n’a pas pu la vérifier : elle servira, et sera écartée si elle échoue." });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!removing) return;
    await apiFetch(`${scopeUrl(scope)}/${encodeURIComponent(removing.provider)}`, { method: "DELETE" });
    await load();
    toast.success(`Clé ${labelOf(removing.provider)} retirée`);
  }

  if (error && !data) return <p className="max-w-xl rounded-xl bg-ko-pale px-4 py-3 text-sm text-ko">{error}</p>;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-[18px] font-bold tracking-tight text-ink">Transcription de la voix</h3>
        <p className="mt-1 max-w-xl text-sm text-ink-3">Pour la dictée et les notes vocales (Telegram, WhatsApp…). Les appels vocaux ne changent pas.</p>
      </div>

      {admin && data?.members && <ScopePicker members={data.members} value={scope} onChange={setScope} />}

      <div className="space-y-3">
        <p className="text-[13px] font-semibold uppercase tracking-wider text-ink-3">Clés enregistrées ({data ? keys.length : "…"})</p>
        {!data ? (
          <div className="flex min-h-[6rem] items-center justify-center rounded-[22px] border border-line bg-surface">
            <Loader2 className="h-6 w-6 animate-spin text-ink-3" />
          </div>
        ) : keys.length === 0 ? (
          <p className="rounded-[22px] border border-dashed border-line px-6 py-6 text-center text-sm text-ink-3">Aucune clé : la transcription passe par les services de Yelema.</p>
        ) : (
          keys.map((k) => (
            <div key={k.provider} className="flex items-center gap-3 rounded-[22px] border border-line bg-surface py-3 pl-4 pr-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-tint text-brand">
                <Mic className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-ink">{labelOf(k.provider)}</p>
                <p className="text-[11px] text-ink-3">Clé {k.hint}</p>
              </div>
              {k.verified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-ok-pale px-2 py-0.5 text-[11px] font-semibold text-ok">
                  <CheckCircle2 className="h-3 w-3" /> Vérifiée
                </span>
              )}
              <button type="button" onClick={() => setRemoving(k)} aria-label={`Retirer la clé ${labelOf(k.provider)}`} className="grid h-8 w-8 place-items-center rounded-full text-ink-3 hover:bg-soft hover:text-ko">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))
        )}
      </div>

      {data && (
        <form onSubmit={save} className="space-y-4 rounded-[22px] border border-line bg-surface p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <KeyRound className="h-4 w-4 text-brand" /> Ajouter ou remplacer une clé
          </p>
          <div role="radiogroup" aria-label="Fournisseur" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(data.providers ?? []).map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={provider === p.id} onClick={() => setProvider(p.id)} className={cn("rounded-xl border p-2.5 text-left text-sm font-semibold transition-colors", provider === p.id ? "border-brand bg-tint/60 text-ink" : "border-line text-ink-2 hover:border-brand/40")}>
                {p.label}
              </button>
            ))}
          </div>
          {chosen && (
            <div className="space-y-1.5">
              <Label htmlFor="voice-key">Clé {chosen.label}</Label>
              <Input id="voice-key" type="password" placeholder={chosen.placeholder} value={secret} onChange={(e) => setSecret(e.target.value)} disabled={busy} autoComplete="off" spellCheck={false} />
              <p className="text-xs text-ink-3">Vérifiée chez le fournisseur, chiffrée et gardée par Yelema ; seuls ses quatre derniers caractères seront affichés. Une clé déjà posée pour ce fournisseur est remplacée.</p>
            </div>
          )}
          <Button type="submit" disabled={busy || !chosen || !secret.trim()}>
            {busy && <Loader2 className="animate-spin" />} Enregistrer
          </Button>
        </form>
      )}

      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Retirer la clé"
        description={`Retirer la clé ${removing ? labelOf(removing.provider) : ""} ? La transcription passera par la clé suivante, ou par les services de Yelema.`}
        confirmText="Retirer"
        destructive
        onConfirm={remove}
      />
    </div>
  );
}
