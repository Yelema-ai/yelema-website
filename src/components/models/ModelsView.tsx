"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Bot, Check, Key, MoreHorizontal, Plus, Search, Server, Settings2, Trash2, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { CUSTOM_PROVIDER, LLM_SOURCE_LABELS, llmPending, type LlmKey, type LlmKeyDraft, type LlmLogin, type LlmOverview, type LlmProvider, type LlmWritten, type SettingScope } from "@/lib/llm";
import { cn } from "@/lib/utils";
import { CustomEndpointDialog } from "./CustomEndpointDialog";
import { MemberSources, StateBadge } from "./MemberSources";
import { ProviderDialog } from "./ProviderDialog";
import { ProviderLoginDialog } from "./ProviderLoginDialog";
import { ProviderLogo } from "./ProviderLogo";
import { ScopePicker } from "./ScopePicker";
import { YelemaModels } from "./YelemaModels";

const STARTER = "Yelema Starter (Moteur inclus par défaut)";
const REFUSED = "Le fournisseur n’accepte plus cette clé. Vos experts ne répondent plus tant qu’elle n’est pas remplacée ou retirée.";
// Une pose prend d'ordinaire moins d'une minute par instance ; au-delà, on cesse de relire seul.
const POLL_MS = 4_000;
const POLL_TRIES = 45;

const scopeUrl = (scope: SettingScope) => (scope.kind === "member" ? `/api/llm/members/${encodeURIComponent(scope.id)}` : `/api/llm/${scope.kind}`);

// Administration · Modèles : sur quel compte de modèle tournent les experts. L'écran affiche ce que
// le back-office sert (fournisseurs, clé en place, état) et lui demande de poser ou de retirer une
// clé ; il n'écrit rien sur une instance et ne garde aucun secret.
export function ModelsView() {
  const [data, setData] = useState<LlmOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<SettingScope>({ kind: "own" });
  const [query, setQuery] = useState("");
  const [connecting, setConnecting] = useState<LlmProvider | null>(null);
  const [removing, setRemoving] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [signingIn, setSigningIn] = useState<LlmLogin | null>(null);
  const [tries, setTries] = useState(0);

  const load = useCallback(async () => {
    try {
      setData(await apiFetch<LlmOverview>("/api/llm"));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Tant qu'une pose est en cours, l'état est relu : l'écran passe seul à « En service » ou à l'échec.
  useEffect(() => {
    if (!data || !llmPending(data) || tries >= POLL_TRIES) return;
    const timer = setTimeout(() => {
      setTries((n) => n + 1);
      void load();
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [data, tries, load]);

  const admin = data?.members !== undefined;
  // Un administrateur règle l'entreprise ou un membre ; un membre, seulement lui-même.
  useEffect(() => {
    if (data) setScope((s) => (admin ? (s.kind === "own" ? { kind: "client" } : s) : { kind: "own" }));
  }, [data, admin]);

  const member = scope.kind === "member" ? data?.members?.find((m) => m.id === scope.id) : undefined;
  const key: LlmKey | null = (scope.kind === "client" ? data?.client : scope.kind === "member" ? member?.own : data?.own) ?? null;
  // Chaque membre pose seul sa propre clé, quel que soit le fournisseur.
  const offered = useMemo(() => data?.catalogue ?? [], [data?.catalogue]);
  const scopeLabel = scope.kind === "client" ? "toute l’entreprise" : scope.kind === "member" ? (member?.name ?? member?.email ?? "ce membre") : "vos experts";
  const below = scope.kind !== "client" && data?.client ? "la clé de l’entreprise" : "Yelema Starter";

  const providers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? offered.filter((p) => [p.label, p.id, p.family, p.defaultModel ?? ""].some((v) => v.toLowerCase().includes(q))) : offered;
  }, [offered, query]);
  const known = data?.catalogue.find((p) => p.id === key?.provider);

  async function written(call: Promise<LlmWritten>, done: string) {
    const out = await call;
    setTries(0);
    await load();
    toast.success(done, { description: out.state === "pending" ? "L’installation sur les instances est en cours." : undefined });
  }

  async function save(draft: LlmKeyDraft) {
    const label = connecting?.label ?? "Fournisseur";
    await written(apiFetch<LlmWritten>(scopeUrl(scope), { method: "PUT", body: JSON.stringify(draft) }), `${label} connecté avec succès`);
    setConnecting(null);
  }

  async function saveCustom(draft: LlmKeyDraft) {
    await written(apiFetch<LlmWritten>(scopeUrl(scope), { method: "PUT", body: JSON.stringify(draft) }), `Serveur ${draft.name ?? ""} enregistré avec succès`);
    setCustomOpen(false);
  }

  // OpenRouter en un clic : le serveur garde le secret de l'échange, la page ne fait que partir et revenir.
  async function openRouter(model: string) {
    const { url } = await apiFetch<{ url: string }>("/api/llm/openrouter", { method: "POST", body: JSON.stringify({ scope, model }) });
    window.location.assign(url);
  }

  // Retour d'OpenRouter avec son code à usage unique : il est retiré de l'adresse avant tout.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (!code) return;
    const state = params.get("state");
    window.history.replaceState({}, document.title, window.location.pathname);
    void written(apiFetch<LlmWritten>("/api/llm/openrouter", { method: "PUT", body: JSON.stringify({ code, state }) }), "OpenRouter connecté avec succès").catch((e: Error) => toast.error(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error && !data) return <p className="max-w-xl rounded-xl bg-ko-pale px-4 py-3 text-sm text-ko">{error}</p>;

  const custom = key?.provider === CUSTOM_PROVIDER ? key : null;
  // Un abonnement se connecte sur UNE instance : jamais pour toute l'entreprise.
  const logins = scope.kind === "client" ? [] : (data?.logins ?? []);
  const signedIn = logins.find((l) => l.id === key?.provider);
  const active = signedIn && key ? `${signedIn.label} (${key.model})` : custom ? `${custom.name ?? "Endpoint privé"} (Serveur privé : ${custom.model})` : key ? `${known?.label ?? "Fournisseur réglé par Yelema"} (${key.model} · clé ${key.hint})` : scope.kind === "client" ? STARTER : null;
  const mine = scope.kind === "own" ? data?.mine : null;
  const inherited = member ? LLM_SOURCE_LABELS[member.source] : mine ? LLM_SOURCE_LABELS[mine.source] : STARTER;
  const state = key?.state ?? (scope.kind === "member" ? member?.state : mine?.state);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[15px] text-ink-2">Connectez vos modèles d’intelligence artificielle (BYOK) : vos experts tournent alors sur votre propre compte.</p>
        <span className="mt-0.5 inline-flex items-center gap-1.5 text-[13px] text-ink-3">
          <Bot className="h-4 w-4" />
          {data ? `${data.catalogue.length} fournisseurs reconnus nativement par Hermes` : "Chargement des fournisseurs…"}
        </span>
      </div>

      {admin && data?.members && <ScopePicker members={data.members} value={scope} onChange={setScope} />}

      {data && (
        <div className="flex flex-col justify-between gap-4 rounded-[22px] border border-line bg-surface p-4 sm:flex-row sm:items-center sm:p-5">
          <div className="flex items-center gap-3.5">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-tint text-brand-ink">
              <Zap className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-3">Moteur Actif</p>
                {state && <StateBadge state={state} />}
              </div>
              <h3 className="mt-0.5 text-[15px] font-bold text-ink">{active ?? inherited}</h3>
              {!key && scope.kind !== "client" && <p className="text-xs text-ink-3">Aucune clé propre : {scope.kind === "member" ? "ce membre suit" : "vous suivez"} le réglage de l’entreprise.</p>}
            </div>
          </div>
          {key && (
            <Button variant="outline" size="sm" onClick={() => setRemoving(true)} className="h-8 rounded-full px-3 text-xs text-ink-2">
              Revenir à {below}
            </Button>
          )}
        </div>
      )}

      {(key?.state === "refused" || mine?.state === "refused") && (
        <div role="alert" className="flex gap-2.5 rounded-[22px] border border-ko/30 bg-ko-pale p-4 text-sm text-ko">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{REFUSED}</p>
        </div>
      )}

      {data?.yelema && data.mine && (
        <YelemaModels
          yelema={data.yelema}
          overridden={data.mine.source === "member" || data.mine.source === "client"}
          onChanged={async (out) => {
            setTries(0);
            await load();
            toast.success("Modèle enregistré", { description: out.state === "pending" ? "L’installation sur votre instance est en cours." : undefined });
          }}
        />
      )}

      <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un modèle ou fournisseur (ex: Claude, GPT, Gemini...)" className="h-10 rounded-full pl-10 pr-9 text-xs" />
          {query && (
            <button type="button" aria-label="Effacer la recherche" onClick={() => setQuery("")} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <span className="shrink-0 text-xs text-ink-3">{query ? `${providers.length} résultat${providers.length > 1 ? "s" : ""}` : data ? `${offered.length} fournisseur${offered.length > 1 ? "s" : ""} disponible${offered.length > 1 ? "s" : ""}` : ""}</span>
      </div>

      {custom && !query && (
        <div className="space-y-3">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-3">
            <Server className="h-3.5 w-3.5 text-brand" />
            Serveur privé configuré
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div className="flex min-h-[76px] items-center gap-3 rounded-[22px] border border-brand/40 bg-surface py-3 pl-4 pr-3 ring-1 ring-brand/30">
              <div className="grid h-11 w-11 shrink-0 select-none place-items-center rounded-[14px] border border-brand/20 bg-tint text-brand-ink">
                <Server className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="truncate text-[15px] font-semibold text-ink">{custom.name}</p>
                  <span className="inline-flex shrink-0 items-center rounded-full bg-tint px-2 py-0.5 text-[10px] font-semibold text-brand-ink">Actif</span>
                  <span className="inline-flex shrink-0 items-center rounded-full bg-soft px-1.5 text-[10px] font-medium text-ink-3">Privé</span>
                </div>
                <p className="truncate font-mono text-[12px] text-ink-3">
                  {custom.baseUrl} • {custom.model}
                </p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" aria-label={`Options pour ${custom.name ?? "l’endpoint"}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover:bg-soft hover:text-ink">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onClick={() => setCustomOpen(true)} className="gap-2 text-xs">
                    <Settings2 className="h-3.5 w-3.5" />
                    Modifier la configuration
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setRemoving(true)} className="gap-2 text-xs text-ko focus:text-ko">
                    <Trash2 className="h-3.5 w-3.5" />
                    Supprimer
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      )}

      {!data ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="h-[76px] animate-pulse rounded-[22px] border border-line bg-soft" />
          ))}
        </div>
      ) : providers.length === 0 ? (
        <div className="space-y-3 rounded-[22px] border border-dashed border-line bg-surface p-8 text-center">
          <p className="text-sm text-ink-2">
            Aucun fournisseur correspondant à « <strong>{query}</strong> ».
          </p>
          <Button variant="outline" size="sm" onClick={() => setQuery("")} className="rounded-full text-xs">
            Effacer la recherche
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {providers.map((provider) => {
            const connected = key?.provider === provider.id ? key : null;
            return (
              <div key={provider.id} className={cn("flex min-h-[76px] items-center gap-3 rounded-[22px] border border-line bg-surface py-3 pl-4 pr-3 transition-colors", connected && "border-brand/40 ring-1 ring-brand/30")}>
                <ProviderLogo family={provider.family} name={provider.label} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-[15px] font-semibold text-ink">{provider.label}</p>
                    {connected && <span className="inline-flex shrink-0 items-center rounded-full bg-tint px-2 py-0.5 text-[10px] font-semibold text-brand-ink">Actif</span>}
                  </div>
                  <p className="truncate text-[13px] text-ink-3">{connected ? `${connected.hint} · ${connected.model}` : (provider.defaultModel ?? "Clé API")}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {connected ? (
                    <>
                      <span className="inline-flex items-center gap-1 rounded-full bg-ok-pale px-2.5 py-1 text-xs font-semibold text-ok">
                        <Check className="h-3.5 w-3.5" />
                        Connecté
                      </span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button type="button" aria-label={`Options pour ${provider.label}`} className="grid h-8 w-8 place-items-center rounded-full text-ink-3 transition-colors hover:bg-soft hover:text-ink">
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem onClick={() => setConnecting(provider)} className="gap-2 text-xs">
                            <Key className="h-3.5 w-3.5" />
                            Modifier les accès
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setRemoving(true)} className="gap-2 text-xs text-ko focus:text-ko">
                            <Trash2 className="h-3.5 w-3.5" />
                            Déconnecter
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => setConnecting(provider)} className="h-8 rounded-full px-3.5 text-xs">
                      Connecter
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          {!query &&
            logins.map((login) => {
              const connected = key?.provider === login.id;
              return (
                <div key={login.id} className={cn("flex min-h-[76px] items-center gap-3 rounded-[22px] border border-line bg-surface py-3 pl-4 pr-3 transition-colors", connected && "border-brand/40 ring-1 ring-brand/30")}>
                  <ProviderLogo family={login.family} name={login.label} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-[15px] font-semibold text-ink">{login.label}</p>
                      <span className="inline-flex shrink-0 items-center rounded-full bg-soft px-1.5 text-[10px] font-medium text-ink-3">OAuth / Compte</span>
                    </div>
                    <p className="truncate text-[13px] text-ink-3">{connected ? `Connecté via OAuth / Compte · ${key?.model ?? ""}` : "Sans clé API : avec votre compte"}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => (connected ? setRemoving(true) : setSigningIn(login))} className="h-8 shrink-0 rounded-full px-3.5 text-xs">
                    {connected ? "Déconnecter" : "Connecter"}
                  </Button>
                </div>
              );
            })}
          {data.customEndpoints && !query && !custom && (
            <button type="button" onClick={() => setCustomOpen(true)} className="group flex min-h-[76px] items-center gap-3 rounded-[22px] border border-dashed border-line bg-surface/40 py-3 pl-4 pr-3 text-left transition-all hover:border-brand/40 hover:bg-soft/70">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] border border-line bg-soft text-ink-3 transition-colors group-hover:border-brand/30 group-hover:text-brand">
                <Plus className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-ink transition-colors group-hover:text-brand">Endpoint ou Serveur privé</p>
                <p className="truncate text-[12px] text-ink-3">Connecter un cluster vLLM, LiteLLM ou une URL d’API privée</p>
              </div>
            </button>
          )}
        </div>
      )}

      {admin && scope.kind === "client" && data?.members && <MemberSources members={data.members} onPick={(id) => setScope({ kind: "member", id })} />}

      <ProviderDialog provider={connecting} current={key?.provider === connecting?.id ? key : null} scopeLabel={scopeLabel} onSubmit={save} onClose={() => setConnecting(null)} onOneClick={connecting?.family === "openrouter" ? openRouter : undefined} />

      <CustomEndpointDialog open={customOpen} current={custom} onSubmit={saveCustom} onClose={() => setCustomOpen(false)} />

      <ProviderLoginDialog
        provider={signingIn}
        url={`${scopeUrl(scope)}/provider-login`}
        scopeLabel={scopeLabel}
        onApproved={async () => {
          setTries(0);
          await load();
        }}
        onClose={() => setSigningIn(null)}
      />

      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title="Déconnecter ce fournisseur ?"
        description={`La clé sera retirée pour ${scopeLabel} : les experts concernés repasseront sur ${below}. La conversation en cours sera interrompue.`}
        confirmText="Déconnecter"
        destructive
        onConfirm={() => written(apiFetch<LlmWritten>(scopeUrl(scope), { method: "DELETE" }), "Fournisseur déconnecté")}
      />
    </div>
  );
}
