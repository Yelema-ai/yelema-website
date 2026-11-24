"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, ShieldCheck, Smartphone } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SettingsCard, SettingsRow } from "@/components/settings/SettingsRows";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch, ApiFetchError, errorText } from "@/lib/api";

interface Factor { id: string; name: string | null; createdAt: string | null }
interface Status { factors: Factor[]; aal: "aal1" | "aal2" }
interface Enrollment { factorId: string; secret: string; qrCode: string }

const REAUTH = "Cette action demande une connexion avec votre code de vérification.";
const isReauth = (e: unknown) => e instanceof ApiFetchError && e.code === "aal2_required";
// Rendered as a picture, never as markup: nothing in it can run.
const qrSrc = (svg: string) => (/^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(svg) ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : null);
const addedOn = (iso: string | null) => (iso && !Number.isNaN(Date.parse(iso)) ? `Ajouté le ${new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}` : undefined);

// Paramètres · Profil › Double authentification: a code from an authenticator app at every sign-in.
export function TwoFactorSettings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reauth, setReauth] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Factor | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await apiFetch<Status>("/api/account/mfa"));
      setLoadError(null);
    } catch (e) {
      setLoadError(errorText(e));
    }
  }, []);
  useEffect(() => void load(), [load]);

  async function reconnect() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.assign(`/login?reauth=1&next=${encodeURIComponent(window.location.pathname)}`);
  }

  const on = (status?.factors.length ?? 0) > 0;
  return (
    <section aria-labelledby="mfa-title" className="mt-6">
      <h2 id="mfa-title" className="mb-3 text-[17px] font-bold text-ink">Double authentification</h2>
      <SettingsCard>
        <SettingsRow
          label={on ? "Activée" : "Désactivée"}
          hint={on ? "Un code de votre application d’authentification est demandé à chaque connexion." : "Protégez votre compte : un code de votre téléphone sera demandé à chaque connexion, en plus du mot de passe ou de Google."}
        >
          {!adding && status ? (
            <Button variant={on ? "outline" : "default"} size="sm" onClick={() => setAdding(true)}>
              <ShieldCheck /> {on ? "Ajouter un appareil" : "Activer"}
            </Button>
          ) : null}
        </SettingsRow>
        {loadError ? <p role="alert" className="px-5 py-4 text-sm text-ko">{loadError}</p> : null}
        {reauth ? (
          <div role="alert" className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-ink-2">{REAUTH}</p>
            <Button variant="outline" size="sm" onClick={reconnect}>Se reconnecter</Button>
          </div>
        ) : null}
        {adding ? (
          <EnrollPanel
            onCancel={() => setAdding(false)}
            onReauth={() => (setAdding(false), setReauth(true))}
            onDone={() => {
              setAdding(false);
              toast.success("Double authentification activée.");
              void load();
            }}
          />
        ) : null}
        {status?.factors.map((f) => (
          <SettingsRow key={f.id} label={f.name || "Application d’authentification"} hint={addedOn(f.createdAt)}>
            <Button variant="outline" size="sm" onClick={() => setRemoving(f)}>
              Retirer
            </Button>
          </SettingsRow>
        ))}
      </SettingsCard>
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Retirer cet appareil ?"
        description={status?.factors.length === 1 ? "C’est le dernier : la double authentification sera désactivée." : "Il ne pourra plus servir à vous connecter."}
        confirmText="Retirer"
        destructive
        onConfirm={async () => {
          if (!removing) return;
          try {
            await apiFetch(`/api/account/mfa/${encodeURIComponent(removing.id)}`, { method: "DELETE" });
            toast.success("Appareil retiré.");
            void load();
          } catch (e) {
            if (!isReauth(e)) throw e;
            setReauth(true);
          }
        }}
      />
    </section>
  );
}

function EnrollPanel({ onCancel, onReauth, onDone }: { onCancel: () => void; onReauth: () => void; onDone: () => void }) {
  const [name, setName] = useState("");
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      if (isReauth(e)) return onReauth();
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const start = () => run(async () => setEnrollment(await apiFetch<Enrollment>("/api/account/mfa", { method: "POST", body: JSON.stringify({ name: name.trim() || "Téléphone" }) })));
  const confirm = () =>
    run(async () => {
      await apiFetch("/api/account/mfa/verify", { method: "POST", body: JSON.stringify({ factorId: enrollment!.factorId, code }) });
      onDone();
    });

  const src = enrollment ? qrSrc(enrollment.qrCode) : null;
  return (
    <form
      className="flex flex-col gap-4 px-5 py-5"
      onSubmit={(e) => {
        e.preventDefault();
        void (enrollment ? confirm() : start());
      }}
    >
      {!enrollment ? (
        <label className="flex flex-col gap-2 text-[13px] font-semibold text-ink-2">
          Nom de l’appareil (facultatif)
          <Input value={name} maxLength={40} placeholder="Téléphone pro" onChange={(e) => setName(e.target.value)} />
        </label>
      ) : (
        <>
          <p className="flex items-start gap-2 text-sm text-ink-2">
            <Smartphone className="mt-0.5 size-4 shrink-0" />
            Scannez ce QR code avec votre application d’authentification (Google Authenticator, Microsoft Authenticator, 1Password…).
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {src ? <img src={src} alt="QR code à scanner avec votre application d’authentification" className="size-44 rounded-xl border border-line bg-white p-2" /> : null}
          <div className="text-sm text-ink-2">
            <p>Impossible de scanner ? Saisissez cette clé dans l’application :</p>
            <p className="mt-1 flex items-center gap-2">
              <code className="select-all break-all rounded-lg bg-soft px-2 py-1 font-mono text-[13px] text-ink">{enrollment.secret.replace(/(.{4})(?=.)/g, "$1 ")}</code>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Copier la clé"
                onClick={() => navigator.clipboard?.writeText(enrollment.secret).then(() => toast.success("Clé copiée."), () => undefined)}
              >
                <Copy />
              </Button>
            </p>
          </div>
          <label className="flex flex-col gap-2 text-[13px] font-semibold text-ink-2">
            Code affiché par l’application
            <Input
              value={code}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              placeholder="123 456"
              aria-invalid={Boolean(error)}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9 ]/g, ""))}
              required
              className="max-w-40"
            />
          </label>
        </>
      )}
      {error ? <p role="alert" className="text-sm text-ko">{error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "En cours…" : enrollment ? "Confirmer" : "Continuer"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
