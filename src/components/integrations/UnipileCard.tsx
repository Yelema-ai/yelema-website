"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronRight, ExternalLink, Loader2, MessagesSquare, Unplug } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { cached, remember } from "@/lib/client-cache";
import { expertDisplayName } from "@/lib/experts";
import { UNIPILE_DASHBOARD, accountBroken, accountDomain, accountName, accountType, type UnipileAccount, type UnipileStatus } from "@/lib/unipile";
import { useExpertsContext } from "@/components/experts/ExpertsProvider";
import { ExpertAvatar } from "@/components/experts/ExpertAvatar";
import { ToolLogo } from "./ToolLogo";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// WhatsApp et messageries : le compte Unipile de la personne. Elle saisit le DSN et la clé que
// Unipile lui donne et choisit les Experts qui pourront lire ses discussions et écrire en son nom ;
// la clé part à son instance et ne revient jamais à l'écran. Branchée, la carte tient sur une ligne
// (« 4 comptes » et les visages des Experts), un bandeau rouge seulement quand un compte a perdu sa
// session, et tout le détail dans un panneau au clic (Leslie, 27/10, maquette A).
export function UnipileCard() {
  // Read last time this visit: shown at once, read again behind it (Leslie, 28/10).
  const [status, setStatus] = useState<UnipileStatus | null>(() => cached<UnipileStatus>("unipile") ?? null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [dsn, setDsn] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [experts, setExperts] = useState<string[]>([]);
  const [tested, setTested] = useState<UnipileAccount[] | null>(null);
  const [busy, setBusy] = useState<"test" | "save" | "clear" | null>(null);
  const [details, setDetails] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [linking, setLinking] = useState<string | null>(null);
  // Who reaches the messaging, changed in the panel itself: the key on the instance is kept (Leslie, 01/11:
  // « il faut carrément re-entrer le DSN et la clé d’API… c’est too much »).
  const [access, setAccess] = useState<string[]>([]);
  const [savingAccess, setSavingAccess] = useState(false);
  const { experts: team } = useExpertsContext();

  const load = useCallback(async () => {
    try {
      setStatus(remember("unipile", await apiFetch<UnipileStatus>("/api/unipile")));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => void load(), [load]);

  const open = () => {
    setDetails(false);
    setEditing(true);
    setApiKey("");
    setTested(null);
    setExperts(status?.experts.length ? status.experts : (status?.available.slice(0, 1) ?? []));
  };
  const draft = () => JSON.stringify({ dsn, apiKey, experts });
  const act = async (kind: "test" | "save" | "clear", fn: () => Promise<void>) => {
    setBusy(kind);
    try {
      await fn();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const test = () => act("test", async () => setTested((await apiFetch<{ accounts: UnipileAccount[] }>("/api/unipile/test", { method: "POST", body: draft() })).accounts));
  const save = () =>
    act("save", async () => {
      setStatus(remember("unipile", await apiFetch<UnipileStatus>("/api/unipile", { method: "PUT", body: draft() })));
      setEditing(false);
      setApiKey("");
      toast.success("Messagerie branchée");
    });
  const clear = () =>
    act("clear", async () => {
      await apiFetch("/api/unipile", { method: "DELETE" });
      toast.success("Messagerie débranchée");
      await load();
    });
  // The tab opens within the click (no popup blocker), then goes to the link the instance asked Unipile for;
  // without one, to the dashboard as before. Coming back to this tab reads the accounts once.
  const reconnect = async (a: UnipileAccount) => {
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    setLinking(a.id);
    let url = UNIPILE_DASHBOARD;
    try {
      url = (await apiFetch<{ url: string }>("/api/unipile/reconnect", { method: "POST", body: JSON.stringify({ accountId: a.id }) })).url;
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLinking(null);
    }
    if (tab) tab.location.href = url;
    else window.location.assign(url);
    window.addEventListener("focus", () => void load(), { once: true });
  };
  const showDetails = () => {
    setAccess(status?.experts ?? []);
    setDetails(true);
  };
  const toggleAccess = (p: string) => setAccess((list) => (list.includes(p) ? list.filter((x) => x !== p) : [...list, p]));
  const accessChanged = Boolean(status) && (access.length !== status!.experts.length || access.some((p) => !status!.experts.includes(p)));
  const saveAccess = async () => {
    setSavingAccess(true);
    try {
      const next = remember("unipile", await apiFetch<UnipileStatus>("/api/unipile/experts", { method: "PUT", body: JSON.stringify({ experts: access }) }));
      setStatus(next);
      setAccess(next.experts);
      toast.success("Accès des Experts mis à jour");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingAccess(false);
    }
  };
  const toggle = (p: string) => setExperts((list) => (list.includes(p) ? list.filter((x) => x !== p) : [...list, p]));
  const ready = dsn.trim() && apiKey.trim() && experts.length > 0;

  const broken = status?.accounts.filter(accountBroken) ?? [];
  const faces = (status?.experts ?? []).map((p) => team.find((e) => e.profileId === p)).filter((e): e is NonNullable<typeof e> => Boolean(e));
  const brokenLabel = broken.length === 1 ? "1 compte à reconnecter" : `${broken.length} comptes à reconnecter`;
  const connected = Boolean(status?.connected) && !editing;

  const count = status ? (status.accounts.length === 1 ? "1 compte" : `${status.accounts.length} comptes`) : "";

  // One line, the height of a connector tile (Leslie, 28/10: « le bandeau est tellement gros inutilement,
  // le connecté n'est pas centré »): the accounts in the subtitle, the faces and the state beside it.
  return (
    <div className="rounded-[22px] border bg-card">
      <div className="flex min-h-[78px] items-center gap-3 py-3 pl-4 pr-3">
        <button
          type="button"
          onClick={() => connected && showDetails()}
          disabled={!connected}
          className="flex min-w-0 flex-1 items-center gap-3 self-stretch text-left disabled:cursor-default"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-soft text-ink-2">
            <MessagesSquare className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold text-ink">Vos messageries</span>
            <span className="block truncate text-[13px] text-ink-3">WhatsApp, LinkedIn, e-mails{connected && count ? ` : ${count}` : ""}</span>
          </span>
          {connected && faces.length > 0 && (
            <span className="flex shrink-0 items-center max-sm:hidden">
              {faces.slice(0, 5).map((e, i) => (
                <ExpertAvatar key={e.profileId} expert={e} size="xs" className={cn("rounded-full ring-2 ring-card", i && "-ml-2")} />
              ))}
              {faces.length > 5 && <span className="ml-1.5 text-[13px] font-semibold text-ink-2">+{faces.length - 5}</span>}
            </span>
          )}
          {status === null && !error ? (
            <span className="h-7 w-24 shrink-0 animate-pulse rounded-full bg-soft" />
          ) : connected ? (
            <>
              {broken.length || status?.accountsError ? null : (
                <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-ok-pale px-2.5 text-xs font-semibold leading-none text-ok">
                  <Check className="h-3.5 w-3.5" />
                  Connecté
                </span>
              )}
              <ChevronRight className="size-4 shrink-0 text-ink-3" />
            </>
          ) : null}
        </button>
        {status && !status.connected && !editing && (
          <Button size="sm" onClick={open} className="shrink-0">
            Connecter
          </Button>
        )}
      </div>

      {error && <p className="border-t px-4 py-2 text-[13px] text-ink-3">{error}</p>}

      {connected && status && (broken.length > 0 || status.accountsError) && (
        <div className="mx-3 mb-3 flex items-center gap-3 rounded-[14px] bg-ko-pale px-3 py-2 text-[13px] text-ko">
          <span className="flex-1 font-semibold">{status.accountsError ? "Unipile ne reconnaît plus votre clé" : brokenLabel}</span>
          {status.accountsError ? (
            <Button size="sm" onClick={open}>Reconnecter</Button>
          ) : (
            <Button size="sm" disabled={linking !== null} onClick={() => (broken.length === 1 ? void reconnect(broken[0]) : showDetails())}>
              {linking ? <Loader2 className="animate-spin" /> : null}
              Reconnecter
            </Button>
          )}
        </div>
      )}

      <Dialog open={details} onOpenChange={(v) => (setDetails(v), setConfirming(false))}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Vos messageries</DialogTitle>
            <DialogDescription className="sr-only">Vos comptes reliés et les Experts qui y ont accès.</DialogDescription>
          </DialogHeader>
          {status && (
            <div className="grid gap-4">
              <div>
                <p className="mb-1 text-[12px] font-semibold uppercase tracking-wider text-ink-3">Comptes</p>
                {status.accounts.map((a) => (
                  <div key={a.id} className="flex min-h-12 items-center gap-3 border-t py-2 first:border-t-0">
                    <ToolLogo logo={`https://www.google.com/s2/favicons?domain=${accountDomain(a.type)}&sz=64`} name={accountType(a.type)} className="size-8 rounded-lg" imgClassName="size-5" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{accountName(a)}</span>
                      <span className="block text-xs text-ink-3">{accountType(a.type)}</span>
                    </span>
                    {accountBroken(a) ? (
                      <Button size="sm" disabled={linking !== null} onClick={() => void reconnect(a)}>
                        {linking === a.id ? <Loader2 className="animate-spin" /> : null}
                        Reconnecter <ExternalLink />
                      </Button>
                    ) : (
                      <Check className="size-4 text-ok" aria-label="Fonctionne" />
                    )}
                  </div>
                ))}
                {status.accounts.length === 0 && <p className="text-sm text-ink-3">Aucun compte relié chez Unipile.</p>}
              </div>
              <div>
                <p className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-ink-3">Experts qui y ont accès</p>
                <div className="flex flex-wrap gap-2">
                  {status.available.map((p) => {
                    const e = team.find((x) => x.profileId === p);
                    const on = access.includes(p);
                    return (
                      <button
                        key={p}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleAccess(p)}
                        disabled={savingAccess}
                        className={cn(
                          "inline-flex min-h-10 items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-[13px] transition-colors disabled:opacity-60",
                          on ? "border-primary bg-primary/5 font-medium text-ink" : "text-ink-3 hover:bg-soft",
                        )}
                      >
                        {e ? <ExpertAvatar expert={e} size="xs" className={cn(!on && "opacity-50 grayscale")} /> : null}
                        {e?.displayName ?? expertDisplayName(p)}
                        {on && <Check className="size-3.5 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 border-t pt-3">
                {accessChanged ? (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => void saveAccess()} disabled={savingAccess || access.length === 0}>
                      {savingAccess && <Loader2 className="animate-spin" />}
                      Enregistrer
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setAccess(status.experts)} disabled={savingAccess}>
                      Annuler
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" onClick={open} disabled={busy !== null}>
                    Changer de clé
                  </Button>
                )}
                <button
                  type="button"
                  onClick={() => (confirming ? void clear().then(() => setDetails(false)) : setConfirming(true))}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[13px] text-ink-3 transition-colors hover:bg-soft hover:text-destructive disabled:opacity-60"
                >
                  {busy === "clear" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />}
                  {confirming ? "Confirmer la déconnexion" : "Déconnecter"}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {editing && status && (
        <div className="space-y-3 border-t px-4 pb-3 pt-3 text-[13px]">
          <p className="text-ink-3">
            Dans votre tableau de bord Unipile, reliez votre WhatsApp, puis copiez le DSN et créez une clé d’API.
          </p>
          <label className="block space-y-1">
            <span className="font-semibold text-ink-2">DSN</span>
            <Input value={dsn} onChange={(e) => setDsn(e.target.value)} placeholder="api8.unipile.com:13851" autoComplete="off" />
          </label>
          <label className="block space-y-1">
            <span className="font-semibold text-ink-2">Clé d’API</span>
            <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={status.connected ? "Saisissez-la de nouveau" : ""} autoComplete="new-password" />
          </label>
          <div className="space-y-1">
            <span className="font-semibold text-ink-2">Experts qui y ont accès</span>
            <div className="flex flex-wrap gap-2">
              {status.available.map((p) => (
                <label key={p} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-ink-2">
                  <input type="checkbox" checked={experts.includes(p)} onChange={() => toggle(p)} />
                  {expertDisplayName(p)}
                </label>
              ))}
            </div>
          </div>
          {tested && (
            <p className="text-ink-2">
              {tested.length ? `Comptes trouvés : ${tested.map((a) => `${a.type} · ${a.name}`).join(", ")}` : "La clé marche, mais aucun compte n’est relié chez Unipile."}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void test()} disabled={!ready || busy !== null}>
              {busy === "test" && <Loader2 className="animate-spin" />}
              Tester
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={!ready || busy !== null}>
              {busy === "save" && <Loader2 className="animate-spin" />}
              Enregistrer
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy !== null}>
              Annuler
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
