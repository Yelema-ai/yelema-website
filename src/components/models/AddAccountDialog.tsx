"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Eye, EyeOff, Loader2, Search, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import { CUSTOM_PROVIDER, type LlmLogin, type LlmProvider } from "@/lib/llm";
import { scopeParam, type AccountDraft, type InstanceScope, type LlmAccount } from "@/lib/llm-accounts";
import { LoginCode } from "./LoginCode";
import { ModelPicker } from "./ModelPicker";
import { ProviderLogo } from "./ProviderLogo";
import { useModelGroups } from "./useModelGroups";

const SAVE_WARNING = "Tous vos Experts passeront par ce compte, routines et messages reçus par Telegram ou WhatsApp compris, de jour comme de nuit. La conversation en cours sera interrompue.";

type Choice = { kind: "key"; provider: LlmProvider } | { kind: "login"; provider: LlmLogin } | { kind: "custom" };

// « Ajouter un compte » : toutes les possibilités (clé ou jeton collé, connexion par navigateur,
// endpoint privé), autant de fois qu'on veut, y compris plusieurs fois le même fournisseur. Le compte
// rejoint son fournisseur en dernier ; le modèle, laissé vide, reprend celui du fournisseur. Le compte
// ne sert que l'instance visée : jamais celle d'un autre membre.
export function AddAccountDialog({ open, scope, scopeLabel, catalogue, logins, customEndpoints, onAdded, onClose }: {
  open: boolean;
  scope: InstanceScope;
  scopeLabel: string;
  catalogue: LlmProvider[];
  logins: LlmLogin[];
  customEndpoints: boolean;
  onAdded: () => Promise<void>;
  onClose: () => void;
}) {
  const [choice, setChoice] = useState<Choice | null>(null);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState({ secret: "", model: "", label: "", name: "", baseUrl: "" });
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<LlmAccount | null>(null);
  const listed = choice && choice.kind !== "custom" ? choice.provider.id : undefined;
  const models = useModelGroups(listed ? (scopeParam(scope) ?? "own") : null, listed);

  useEffect(() => {
    if (!open) return;
    setChoice(null);
    setQuery("");
    setPending(null);
  }, [open]);
  useEffect(() => {
    setForm({ secret: "", model: "", label: "", name: "", baseUrl: "" });
    setShown(false);
    setError(null);
  }, [choice]);

  const options = useMemo(() => {
    const all: { choice: Choice; label: string; family: string; hint: string }[] = [
      ...catalogue.map((p) => ({ choice: { kind: "key" as const, provider: p }, label: p.label, family: p.family, hint: p.defaultModel ?? "Clé API" })),
      ...logins.map((l) => ({ choice: { kind: "login" as const, provider: l }, label: l.label, family: l.family, hint: "Connexion avec votre compte" })),
      ...(customEndpoints ? [{ choice: { kind: "custom" as const }, label: "Endpoint ou serveur privé", family: "custom", hint: "vLLM, LiteLLM, URL d’API privée" }] : []),
    ];
    const q = query.trim().toLowerCase();
    return q ? all.filter((o) => [o.label, o.family, o.hint].some((v) => v.toLowerCase().includes(q))) : all;
  }, [catalogue, logins, customEndpoints, query]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!choice) return;
    const draft: AccountDraft = { provider: choice.kind === "custom" ? CUSTOM_PROVIDER : choice.provider.id };
    if (choice.kind === "key" && !form.secret.trim()) return setError("Collez la clé ou le jeton de ce compte.");
    if (choice.kind === "custom" && (!form.name.trim() || !form.baseUrl.trim() || !form.model.trim())) return setError("Indiquez le nom, l’adresse et le modèle du serveur.");
    for (const k of ["secret", "model", "label", "name", "baseUrl"] as const) if (form[k].trim()) draft[k] = form[k].trim();
    setBusy(true);
    setError(null);
    try {
      const out = await apiFetch<{ account: LlmAccount }>(`/api/llm/accounts?scope=${encodeURIComponent(scopeParam(scope) ?? "own")}`, { method: "POST", body: JSON.stringify(draft) });
      if (out.account.state === "pending" && out.account.login) setPending(out.account);
      else {
        await onAdded();
        onClose();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const title = pending ? "Approuvez la connexion" : choice ? `Ajouter : ${choice.kind === "custom" ? "serveur privé" : choice.provider.label}` : "Ajouter un compte";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-2xl" onEscapeKeyDown={(e) => (e.target as Element | null)?.closest?.("[data-model-picker]") && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-lg text-ink">
            {choice && !pending && (
              <button type="button" aria-label="Revenir à la liste" onClick={() => setChoice(null)} className="grid h-7 w-7 place-items-center rounded-full text-ink-3 hover:bg-soft hover:text-ink">
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            {title}
          </DialogTitle>
          <DialogDescription className="text-xs text-ink-3">Pour {scopeLabel}. Le compte s’ajoute en dernier dans son fournisseur.</DialogDescription>
        </DialogHeader>

        {pending?.login ? (
          <LoginCode account={pending} onDone={async () => { await onAdded(); onClose(); }} />
        ) : !choice ? (
          <div className="space-y-3 py-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher (Claude, Gemini, Codex…)" className="h-9 rounded-full pl-9 text-xs" autoFocus />
            </div>
            <div className="grid max-h-[50vh] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {options.map((o) => (
                <button key={`${o.choice.kind}:${o.label}`} type="button" title={o.label} onClick={() => setChoice(o.choice)} className="flex items-center gap-2.5 rounded-2xl border border-line bg-surface p-2.5 text-left transition-colors hover:border-brand/40 hover:bg-soft/60">
                  {o.choice.kind === "custom" ? <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-soft text-ink-3"><Server className="h-4 w-4" /></span> : <ProviderLogo family={o.family} name={o.label} />}
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-ink">{o.label}</span>
                    <span className="block truncate text-[11px] text-ink-3">{o.hint}</span>
                  </span>
                </button>
              ))}
              {options.length === 0 && <p className="col-span-full py-6 text-center text-xs text-ink-3">Aucune possibilité ne correspond.</p>}
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3 py-2">
            {choice.kind === "custom" && (
              <>
                <Field id="acc-name" label="Nom du serveur" value={form.name} onChange={set("name")} placeholder="vllm-prod" />
                <Field id="acc-url" label="Adresse de l’API" value={form.baseUrl} onChange={set("baseUrl")} placeholder="https://llm.entreprise.com/v1" />
              </>
            )}
            {choice.kind !== "login" && (
              <div className="space-y-1.5">
                <Label htmlFor="acc-secret" className="text-xs font-semibold text-ink">{choice.kind === "custom" ? "Clé (facultative)" : "Clé ou jeton"}</Label>
                <div className="relative">
                  <Input id="acc-secret" type={shown ? "text" : "password"} autoComplete="off" spellCheck={false} value={form.secret} onChange={set("secret")} placeholder={choice.kind === "key" ? choice.provider.placeholder : ""} className="pr-10 font-mono text-xs" autoFocus />
                  <button type="button" aria-label={shown ? "Masquer la clé" : "Afficher la clé"} onClick={() => setShown(!shown)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink">
                    {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}
            {choice.kind === "login" && <p className="rounded-xl border border-line bg-soft/50 p-3 text-xs text-ink-3">Aucune clé à coller : vous recevrez une adresse et un code à saisir chez le fournisseur, avec le compte à ajouter. Ajoutez autant de comptes différents que vous voulez.</p>}
            {choice.kind === "custom" ? (
              <Field id="acc-model" label="Modèle" value={form.model} onChange={set("model")} placeholder="Celui du serveur" mono />
            ) : (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-ink">Modèle (facultatif)</p>
                <ModelPicker
                  label="Modèle"
                  className="sm:w-full"
                  groups={models ?? []}
                  value={form.model ? { provider: choice.provider.id, model: form.model } : null}
                  nullLabel={`Celui du fournisseur${choice.kind === "key" && choice.provider.defaultModel ? ` (${choice.provider.defaultModel})` : ""}`}
                  customProvider={choice.provider.id}
                  onChange={(c) => setForm((f) => ({ ...f, model: c?.model ?? "" }))}
                />
              </div>
            )}
            <Field id="acc-label" label="Nom du compte (facultatif)" value={form.label} onChange={set("label")} placeholder="Compta, Abonnement de Selim…" />
            <p className="text-[11px] leading-relaxed text-ink-3">{SAVE_WARNING}</p>
            {error && <p role="alert" className="rounded-xl bg-ko-pale px-3 py-2 text-xs text-ko">{error}</p>}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Annuler</Button>
              <Button type="submit" disabled={busy}>
                {busy ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />{choice.kind === "login" ? "Démarrage…" : "Vérification…"}</> : choice.kind === "login" ? "Se connecter" : "Ajouter le compte"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ id, label, value, onChange, placeholder, mono }: { id: string; label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; placeholder?: string; mono?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-semibold text-ink">{label}</Label>
      <Input id={id} autoComplete="off" spellCheck={false} value={value} onChange={onChange} placeholder={placeholder} className={mono ? "font-mono text-xs" : "text-xs"} />
    </div>
  );
}
