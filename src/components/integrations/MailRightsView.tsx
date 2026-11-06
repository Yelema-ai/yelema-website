"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import type { MailRights, MailRightsPatch } from "@/lib/mail";
import { expertDisplayName } from "@/lib/experts";
import { useCatalogue } from "@/components/experts/useCatalogue";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { ExpertAvatar } from "@/components/experts/ExpertAvatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Who may have each expert write e-mails: one line per expert, on one page, filtered (Leslie, 04/11).
// Three settings that add up: the expert may send at all, it may write outside the company, and only
// some members may ask it to. The back office applies them before every sending, whoever asks.

const STATUS: Record<"pending" | "suspended", string> = { pending: "En création", suspended: "Suspendue" };

const ALL_CYCLES = "*";

export function MailRightsView() {
  const [inboxes, setInboxes] = useState<MailRights[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [cycle, setCycle] = useState(ALL_CYCLES);
  const [query, setQuery] = useState("");
  const [opened, setOpened] = useState<string | null>(null);
  const { current } = useWorkspace();
  const { catalogue } = useCatalogue(current?.id);
  const entry = (key: string) => catalogue.experts.find((e) => e.key === key);
  const nameOf = (key: string) => entry(key)?.name ?? expertDisplayName(key);

  useEffect(() => {
    apiFetch<{ items: MailRights[] }>("/api/mail/rights")
      .then((data) => setInboxes(data.items))
      .catch((e: Error) => setError(e.message));
  }, []);

  async function save(inbox: MailRights, patch: MailRightsPatch) {
    setSaving(inbox.expert);
    try {
      const next = await apiFetch<MailRights>(`/api/mail/rights/${inbox.expert}`, { method: "PUT", body: JSON.stringify(patch) });
      setInboxes((list) => (list ?? []).map((i) => (i.expert === next.expert ? next : i)));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  const q = query.trim().toLowerCase();
  const found = (inboxes ?? []).filter((i) => !q || nameOf(i.expert).toLowerCase().includes(q) || (i.address ?? "").toLowerCase().includes(q));
  // One block per cycle, in the catalogue's order (Leslie, 06/11: by cycle, with faces, not one long list).
  const order = (key: string) => {
    const i = catalogue.experts.findIndex((e) => e.key === key);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  const groups = [...found]
    .sort((a, b) => order(a.expert) - order(b.expert))
    .reduce<{ key: string; label: string; items: MailRights[] }[]>((acc, i) => {
      const c = entry(i.expert)?.category;
      const key = c?.key ?? "_";
      const g = acc.find((x) => x.key === key) ?? (acc.push({ key, label: c?.label ?? "Autres", items: [] }), acc[acc.length - 1]!);
      g.items.push(i);
      return acc;
    }, []);
  const writing = (inboxes ?? []).filter((i) => i.sendEnabled).length;

  return (
    <div className="max-w-5xl">
      <h1 className="sr-only">E-mails des Experts</h1>

      {error && <p className="mt-4 max-w-xl rounded-xl bg-ko-pale px-4 py-3 text-sm text-ko">{error}</p>}
      {!inboxes && !error && <Loader2 className="mt-6 h-5 w-5 animate-spin text-ink-3" aria-label="Chargement" />}
      {inboxes?.length === 0 && <p className="mt-6 rounded-[22px] border border-line bg-surface p-8 text-center text-sm text-ink-3">Aucun Expert n’a encore de boîte e-mail.</p>}

      {inboxes && inboxes.length > 0 && (
        <>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative block min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Chercher un Expert"
                aria-label="Chercher un Expert"
                className="h-11 w-full rounded-full border border-line bg-surface pl-10 pr-3 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-brand/40"
              />
            </label>
            <span className="shrink-0 text-sm text-ink-3">
              {inboxes.length} Experts, {writing} écri{writing > 1 ? "vent" : "t"}
            </span>
          </div>

          <div className="mt-3 overflow-hidden rounded-[22px] border border-line bg-surface">
            <ul className="divide-y divide-line">
              {groups.map((g) => {
                const open = q.length > 0 || cycle === g.key;
                return (
                  <li key={g.key}>
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setCycle((c) => (c === g.key ? ALL_CYCLES : g.key))}
                      className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left hover:bg-soft/50 md:gap-4 md:px-6"
                    >
                      <span className="w-32 shrink-0 text-[15px] font-bold text-ink md:w-44">{g.label}</span>
                      <span className="flex shrink-0 -space-x-2">
                        {g.items.slice(0, 4).map((i) => (
                          <ExpertAvatar key={i.expert} expert={{ displayName: nameOf(i.expert), gateway: null, photoUrl: entry(i.expert)?.avatarUrl ?? null }} size="xs" className="rounded-full ring-2 ring-surface" />
                        ))}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-ink-3 max-sm:hidden">{summary(g.items)}</span>
                      <ChevronDown className={cn("ml-auto h-4 w-4 shrink-0 text-ink-3 transition-transform", open && "rotate-180")} />
                    </button>
                    {open && (
                      <div className="border-t border-line bg-soft/40">
                        <p className="px-4 pt-2 text-[13px] text-ink-3 sm:hidden">{summary(g.items)}</p>
                        <div className="hidden grid-cols-[minmax(0,1fr)_72px_110px_190px] gap-4 px-5 pt-2.5 text-xs font-semibold text-ink-3 md:grid">
                          <span>Expert</span>
                          <span>Écrit</span>
                          <span>Hors de l’entreprise</span>
                          <span>À la demande de</span>
                        </div>
                        <ul className="divide-y divide-line">
                          {g.items.map((inbox) => (
                            <InboxRow
                              key={inbox.expert}
                              inbox={inbox}
                              name={nameOf(inbox.expert)}
                              photoUrl={entry(inbox.expert)?.avatarUrl ?? null}
                              saving={saving === inbox.expert}
                              open={opened === inbox.expert}
                              onToggle={() => setOpened((o) => (o === inbox.expert ? null : inbox.expert))}
                              onSave={(patch) => void save(inbox, patch)}
                            />
                          ))}
                        </ul>
                      </div>
                    )}
                  </li>
                );
              })}
              {groups.length === 0 && <li className="px-5 py-8 text-center text-sm text-ink-3">Aucun Expert ne correspond.</li>}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

// « 2 sur 3 écrivent, 1 hors de l’entreprise, 1 en création » ; one Expert: « Écrit » or « N’écrit pas ».
function summary(items: MailRights[]): string {
  const w = items.filter((i) => i.sendEnabled).length;
  const out = items.filter((i) => i.sendEnabled && i.externalAllowed).length;
  const pending = items.filter((i) => i.status === "pending").length;
  const parts = [items.length === 1 ? (w ? "Écrit" : "N’écrit pas") : `${w} sur ${items.length} écri${w > 1 ? "vent" : "t"}`];
  if (out) parts.push(items.length === 1 ? "hors de l’entreprise" : `${out} hors de l’entreprise`);
  if (pending) parts.push(items.length === 1 ? "en création" : `${pending} en création`);
  return parts.join(", ");
}

function InboxRow({ inbox, name, photoUrl, saving, open, onToggle, onSave }: {
  inbox: MailRights;
  name: string;
  photoUrl: string | null;
  saving: boolean;
  open: boolean;
  onToggle: () => void;
  onSave: (patch: MailRightsPatch) => void;
}) {
  const locked = saving || inbox.status === "suspended";
  const who = inbox.eligible.length === 0 ? "Aucun membre" : inbox.senders.length > 0 ? `${inbox.senders.length} membres sur ${inbox.eligible.length}`.replace(/^1 membres/, "1 membre") : "Tous les membres";
  return (
    <li data-mail-row aria-busy={saving}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 md:grid-cols-[minmax(0,1fr)_72px_110px_190px] md:px-5">
        <div className="col-span-2 flex min-w-0 items-center gap-3 pb-1 md:col-span-1 md:pb-0">
          <ExpertAvatar expert={{ displayName: name, gateway: null, photoUrl }} size="sm" />
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <span className="truncate">{name}</span>
              {inbox.status !== "active" && <Badge variant={inbox.status === "suspended" ? "warning" : "muted"}>{STATUS[inbox.status]}</Badge>}
            </p>
            <p className="truncate text-xs text-ink-3">{inbox.address ?? "Adresse en cours de création"}</p>
          </div>
        </div>
        <span className="text-[13px] text-ink-2 md:hidden">Écrit</span>
        <Switch label={`Écrit : ${name}`} checked={inbox.sendEnabled} disabled={locked} onChange={(sendEnabled) => onSave({ sendEnabled })} />
        <span className="text-[13px] text-ink-2 md:hidden">Hors de l’entreprise</span>
        <Switch label={`Hors de l’entreprise : ${name}`} checked={inbox.externalAllowed} disabled={locked || !inbox.sendEnabled} onChange={(externalAllowed) => onSave({ externalAllowed })} />
        <span className="text-[13px] text-ink-2 md:hidden">À la demande de</span>
        <button
          type="button"
          aria-expanded={open}
          disabled={locked || inbox.eligible.length === 0}
          onClick={onToggle}
          className="inline-flex min-h-11 items-center justify-between gap-2 rounded-[10px] text-left text-[13px] font-semibold text-ink hover:text-brand-ink disabled:font-normal disabled:text-ink-3 md:w-full"
        >
          <span className="truncate">{who}</span>
          {inbox.eligible.length > 0 && <ChevronDown className={cn("h-4 w-4 shrink-0 text-ink-3 transition-transform", open && "rotate-180")} />}
        </button>
      </div>
      {open && (
        <div className="border-t border-line bg-soft/40 px-4 pb-4 md:px-5">
          <MemberAccess inbox={inbox} name={name} locked={locked} onSave={(senders) => onSave({ senders })} />
        </div>
      )}
    </li>
  );
}

// Who may have the expert write and read its inbox: every member who has it (no list: the back office
// reads an empty one so, and members added later are in too), or some of them, picked in a list that
// stays usable with many members (search, scroll, count). « Certains » needs at least one name: an
// empty list would mean everyone again, so the last checked member cannot be unchecked.
function MemberAccess({ inbox, name, locked, onSave }: { inbox: MailRights; name: string; locked: boolean; onSave: (senders: string[]) => void }) {
  const [some, setSome] = useState(inbox.senders.length > 0);
  const [query, setQuery] = useState("");
  useEffect(() => setSome(inbox.senders.length > 0 || some), [inbox.senders.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? inbox.eligible.filter((e) => e.toLowerCase().includes(q)) : inbox.eligible;
  }, [inbox.eligible, query]);
  const choice = (on: boolean, label: string, hint: string, pick: () => void) => (
    <label className={cn("flex flex-1 cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition-colors", on ? "border-brand/40 bg-tint/60" : "border-line hover:bg-soft")}>
      <input type="radio" name={`acces-${inbox.expert}`} className="mt-1 h-4 w-4 accent-[var(--brand)]" checked={on} disabled={locked} onChange={pick} />
      <span>
        <span className="block text-sm font-semibold text-ink">{label}</span>
        <span className="block text-xs text-ink-3">{hint}</span>
      </span>
    </label>
  );
  return (
    <fieldset className="mt-3" disabled={locked}>
      <legend className="sr-only">Qui peut le faire écrire et lire sa boîte</legend>
      <div className="flex flex-col gap-2 sm:flex-row">
        {choice(!some, `Tous les membres qui ont ${name}`, `${inbox.eligible.length} aujourd’hui, et ceux qui l’auront plus tard`, () => {
          setSome(false);
          if (inbox.senders.length > 0) onSave([]);
        })}
        {choice(some, "Certains membres", some ? `${inbox.senders.length} sur ${inbox.eligible.length}` : "Vous les choisissez un par un", () => setSome(true))}
      </div>
      {some && (
        <div className="mt-3 rounded-2xl border border-line">
          {inbox.eligible.length > 6 && (
            <label className="relative block border-b border-line">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Chercher un membre"
                aria-label="Chercher un membre"
                className="h-11 w-full rounded-t-2xl bg-transparent pl-10 pr-3 text-sm text-ink outline-none placeholder:text-ink-3"
              />
            </label>
          )}
          <ul className="max-h-64 overflow-y-auto p-1.5">
            {shown.map((email) => {
              const checked = inbox.senders.includes(email);
              const last = checked && inbox.senders.length === 1;
              return (
                <li key={email}>
                  <label className="flex min-h-11 items-center gap-3 rounded-xl px-2.5 text-sm text-ink hover:bg-soft" title={last ? "Au moins un membre reste coché" : undefined}>
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--brand)]"
                      checked={checked}
                      disabled={last}
                      onChange={(e) => onSave(e.target.checked ? [...inbox.senders, email] : inbox.senders.filter((x) => x !== email))}
                    />
                    <span className="truncate">{email}</span>
                  </label>
                </li>
              );
            })}
            {shown.length === 0 && <li className="px-2.5 py-3 text-sm text-ink-3">Aucun membre ne correspond.</li>}
          </ul>
          {inbox.senders.length === 0 && <p className="border-t border-line px-4 py-2.5 text-xs text-ink-3">Cochez au moins un membre : en attendant, tous y ont accès.</p>}
        </div>
      )}
    </fieldset>
  );
}

function Switch({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      // 44 px to touch, for a smaller switch.
      className="group inline-flex min-h-11 w-fit items-center justify-self-end disabled:cursor-not-allowed md:justify-self-start"
    >
      <span className={cn("relative h-6 w-10 rounded-full transition-colors group-disabled:opacity-40", checked ? "bg-brand" : "bg-line")}>
        <span className={cn("absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform", checked && "translate-x-4")} />
      </span>
    </button>
  );
}
