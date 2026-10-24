"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import type { LlmOverview } from "@/lib/llm";
import { catalogToolkit } from "@/lib/integration-catalog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// The shapes of GET /api/composio-usage and /calls, as the back office gives them (see
// BoComposioUsage, BoComposioCall). The back office also sends what each call cost Yelema: never
// shown here, the client sees volumes, not Yelema's own costs.
interface Count {
  executions: number;
}

interface Usage extends Count {
  from: string;
  to: string;
  byToolkit: ({ toolkit: string | null } & Count)[];
  byMember: ({ email: string | null; name: string | null } & Count)[];
}

interface Call {
  occurredAt: string;
  email: string | null;
  name: string | null;
  toolkit: string | null;
  tool: string;
  via: string;
  httpStatus: number;
}

interface CallsPage {
  page: number;
  hasMore: boolean;
  items: Call[];
}

const pad = (n: number) => String(n).padStart(2, "0");

// The back office counts days in UTC, so the months offered here are UTC months too.
function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}`;
}

// "2026-10" -> its first and last day, the last one no later than today.
function period(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${month}-${pad(last)}`;
  const today = new Date().toISOString().slice(0, 10);
  return { from: `${month}-01`, to: end > today ? today : end };
}

const count = new Intl.NumberFormat("fr-FR");

const moment = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const toolkitName = (slug: string | null) => (slug ? (catalogToolkit(slug)?.name ?? slug) : "Autre");
const memberName = (m: { email: string | null; name: string | null }) => m.name ?? m.email ?? "Sans membre";

const ok = (c: Call) => c.httpStatus >= 200 && c.httpStatus < 300;

// One CSV field, for a French spreadsheet (semicolons, quotes doubled). A value a spreadsheet would
// run as a formula (a member named « =HYPERLINK(…) ») is kept as text by a leading apostrophe.
const cell = (raw: string) => {
  const v = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

// Every call of the period, read page by page (100 a page), as a CSV the member downloads.
const CSV_MAX_PAGES = 100;

function query(month: string, member: string, page?: number): string {
  const params = new URLSearchParams(period(month));
  if (member) params.set("member", member);
  if (page) params.set("page", String(page));
  return params.toString();
}

// How many times the experts called a connected tool over a month (model tokens are not counted
// here): the total, by member, by application, and the calls one by one, downloadable as CSV.
// Everything is read from the back office, which records each execution.
export function UsageView() {
  const [month, setMonth] = useState(currentMonth);
  const [member, setMember] = useState("");
  const [usage, setUsage] = useState<Usage | null>(null);
  // The members to filter by: those of the month's unfiltered reading.
  const [members, setMembers] = useState<Usage["byMember"]>([]);
  const [calls, setCalls] = useState<CallsPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  // An answer for a month or a member the screen has left is dropped.
  const asked = useRef("");

  useEffect(() => {
    const key = `${month}|${member}`;
    asked.current = key;
    setLoading(true);
    Promise.all([
      apiFetch<Usage>(`/api/composio-usage?${query(month, member)}`),
      apiFetch<CallsPage>(`/api/composio-usage/calls?${query(month, member, 1)}`),
    ])
      .then(([u, c]) => {
        if (asked.current !== key) return;
        setUsage(u);
        setCalls(c);
        if (!member) setMembers(u.byMember.filter((m) => m.email));
        setError(null);
      })
      .catch((e: Error) => {
        if (asked.current !== key) return;
        setUsage(null);
        setCalls(null);
        setError(e.message);
      })
      .finally(() => {
        if (asked.current === key) setLoading(false);
      });
  }, [month, member]);

  const [exporting, setExporting] = useState(false);
  async function download() {
    setExporting(true);
    try {
      const all: Call[] = [];
      let truncated = false;
      for (let page = 1; page <= CSV_MAX_PAGES; page += 1) {
        const res = await apiFetch<CallsPage>(`/api/composio-usage/calls?${query(month, member, page)}`);
        all.push(...res.items);
        if (!res.hasMore) break;
        if (page === CSV_MAX_PAGES) truncated = true;
      }
      const lines = [
        ["Date", "Membre", "E-mail", "Application", "Outil", "Résultat"].join(";"),
        ...all.map((c) =>
          [new Date(c.occurredAt).toLocaleString("fr-FR"), c.name ?? "", c.email ?? "", c.via === "meta" ? "Recherche d’outils" : toolkitName(c.toolkit), c.tool, ok(c) ? "Abouti" : "Non abouti"]
            .map(cell)
            .join(";")
        ),
      ];
      // The BOM lets Excel read the accents.
      const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `appels-outils-${month}${member ? `-${member.split("@")[0]}` : ""}.csv`;
      document.body.append(a);
      a.click();
      a.remove();
      // Firefox may still be reading the file when click() returns.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      if (truncated) toast.warning(`Export limité à ${count.format(all.length)} appels. Choisissez un membre pour exporter le reste.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  // On a key of their own, the model itself is paid to the provider: Yelema measures none of it.
  const [ownKey, setOwnKey] = useState(false);
  useEffect(() => {
    apiFetch<LlmOverview>("/api/llm")
      .then((o) => setOwnKey(Boolean(o.own) || (o.members ?? []).some((m) => m.own)))
      .catch(() => undefined);
  }, []);

  async function more() {
    if (!calls) return;
    const key = asked.current;
    setLoadingMore(true);
    try {
      const next = await apiFetch<CallsPage>(`/api/composio-usage/calls?${query(month, member, calls.page + 1)}`);
      if (asked.current === key) setCalls({ ...next, items: [...calls.items, ...next.items] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="max-w-5xl">
      <h1 className="sr-only">Consommation d’outils hors tokens</h1>
      <p className="mt-1 text-sm text-ink-2">Les appels de vos Experts aux outils connectés (Gmail, Sheets, HubSpot…).</p>
      {ownKey && (
        <p className="mt-3 max-w-2xl rounded-xl border border-line bg-soft px-4 py-3 text-[13px] text-ink-2">
          Des Experts tournent sur votre propre clé de modèle : la dépense de modèle n’est pas mesurée par Yelema, elle se lit chez votre fournisseur.
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <label className="text-[13px] font-semibold text-ink-3">
          Mois
          <Input
            type="month"
            value={month}
            max={currentMonth()}
            onChange={(e) => {
              if (!e.target.value) return;
              setMonth(e.target.value);
              setMember("");
            }}
            className="mt-1 w-44"
          />
        </label>
        <label className="text-[13px] font-semibold text-ink-3">
          Membre
          <select
            value={member}
            onChange={(e) => setMember(e.target.value)}
            className="mt-1 flex h-11 w-64 max-w-full rounded-xl border border-line bg-surface px-3 text-[15px] font-normal text-ink focus-visible:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/15"
          >
            <option value="">Tous les membres</option>
            {members.map((m) => (
              <option key={m.email} value={m.email ?? ""}>
                {memberName(m)}
              </option>
            ))}
          </select>
        </label>
        {loading && <Loader2 className="mb-3 h-4 w-4 animate-spin text-ink-3" aria-label="Chargement" />}
      </div>

      {error && <p className="mt-4 max-w-xl rounded-xl bg-ko-pale px-4 py-3 text-sm text-ko">{error}</p>}

      {usage && calls && (
        <>
          <section className="mt-5 rounded-[22px] border border-line bg-surface p-5 sm:p-6">
            <p className="text-[13px] font-semibold text-ink-3">Nombre d’appels d’outils</p>
            <p className="mt-1 font-display text-[32px] font-bold leading-tight text-ink">{count.format(usage.executions)}</p>
          </section>

          {usage.executions === 0 && calls.items.length === 0 ? (
            <p className="mt-6 text-sm text-ink-2">Aucun appel d’outil sur cette période.</p>
          ) : (
            <>
              <div className="mt-8 grid gap-6 lg:grid-cols-2">
                <Breakdown title="Par membre" label="Membre" total={usage.executions} rows={usage.byMember.map((m) => ({ ...m, key: m.email ?? "", name: memberName(m) }))} />
                <Breakdown
                  title="Par application"
                  label="Application"
                  total={usage.executions}
                  rows={usage.byToolkit.map((t) => ({ ...t, key: t.toolkit ?? "", name: toolkitName(t.toolkit) }))}
                />
              </div>

              <div className="mt-8 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-lg font-semibold text-ink">Détail des appels</h2>
                <Button variant="outline" size="sm" onClick={download} disabled={exporting} className="gap-1.5">
                  {exporting ? <Loader2 className="animate-spin" /> : <Download />}
                  Télécharger en CSV
                </Button>
              </div>
              <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-surface">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-soft text-left text-xs text-ink-3">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Date</th>
                      <th className="px-4 py-2.5 font-medium">Membre</th>
                      <th className="px-4 py-2.5 font-medium">Application</th>
                      <th className="px-4 py-2.5 font-medium">Outil</th>
                      <th className="px-4 py-2.5 font-medium">Résultat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calls.items.map((c, i) => (
                      <tr key={`${c.occurredAt}-${i}`} className="border-t border-line">
                        <td className="whitespace-nowrap px-4 py-3 text-ink-2">{moment(c.occurredAt)}</td>
                        <td className="px-4 py-3 text-ink">{memberName(c)}</td>
                        <td className="px-4 py-3 text-ink-2">{c.via === "meta" ? "—" : toolkitName(c.toolkit)}</td>
                        <td className="px-4 py-3">
                          <span className="break-all font-mono text-[13px] text-ink-2">{c.tool}</span>
                          {c.via === "meta" && (
                            <Badge variant="muted" className="ml-2">
                              Recherche d’outils
                            </Badge>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {ok(c) ? <span className="text-ink-2">Abouti</span> : <Badge variant="warning">Non abouti</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {calls.hasMore && (
                <Button variant="outline" className="mt-4" onClick={more} disabled={loadingMore}>
                  {loadingMore && <Loader2 className="animate-spin" />}
                  Voir les appels plus anciens
                </Button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function Breakdown({ title, label, total, rows }: { title: string; label: string; total: number; rows: ({ key: string; name: string } & Count)[] }) {
  return (
    <section>
      <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
      <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-soft text-left text-xs text-ink-3">
            <tr>
              <th className="px-4 py-2.5 font-medium">{label}</th>
              <th className="px-4 py-2.5 text-right font-medium">Appels</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t border-line">
                <td className="px-4 py-3">
                  <span className="font-medium text-ink">{row.name}</span>
                  <span aria-hidden className="mt-1.5 block h-1.5 rounded-full bg-soft">
                    <span className="block h-full rounded-full bg-brand/70" style={{ width: `${total ? Math.max(2, Math.round((row.executions / total) * 100)) : 0}%` }} />
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-ink">{count.format(row.executions)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
