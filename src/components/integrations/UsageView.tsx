"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import type { LlmOverview } from "@/lib/llm";
import { catalogToolkit } from "@/lib/integration-catalog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Picker } from "@/components/ui/picker";
import { cn } from "@/lib/utils";

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

// The last `n` months, newest first: « novembre 2026 ».
function lastMonths(n: number): { value: string; label: string }[] {
  const now = new Date();
  return Array.from({ length: n }, (_, k) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1));
    const label = d.toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
    return { value: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`, label: label.charAt(0).toUpperCase() + label.slice(1) };
  });
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
  new Date(iso).toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const toolkitName = (slug: string | null) =>
  slug ? (catalogToolkit(slug)?.name ?? slug) : "Autre";

// A tool's code name (GMAIL_SEND_EMAIL) said in French (« Envoi d’e-mail »), Leslie 06/11: no technical
// names on screen. The code name stays in the CSV and on hover. Unknown words fall back to the code's own.
const VERBS: [RegExp, string][] = [
  [/^(SEND|REPLY|FORWARD)$/, "Envoi"],
  [/^(CREATE|ADD|INSERT|UPLOAD|POST)$/, "Création"],
  [/^(UPDATE|EDIT|PATCH|MODIFY|APPEND|MOVE|RENAME)$/, "Mise à jour"],
  [/^(DELETE|REMOVE|TRASH|ARCHIVE)$/, "Suppression"],
  [/^(SEARCH|FIND|QUERY)$/, "Recherche"],
  [/^(FETCH|GET|LIST|READ|RETRIEVE|DOWNLOAD|EXPORT)$/, "Lecture"],
];
const THINGS: [RegExp, string][] = [
  [/^(EMAIL|EMAILS|MESSAGE|MESSAGES|MAIL|DRAFT|DRAFTS)$/, "e-mail"],
  [/^(EVENT|EVENTS|CALENDAR)$/, "événement"],
  [/^(FILE|FILES|DOCUMENT|DOC|FOLDER)$/, "fichier"],
  [/^(SPREADSHEET|SHEET|SHEETS|ROW|ROWS|VALUES|CELLS)$/, "tableur"],
  [/^(PAGE|PAGES|DATABASE)$/, "page"],
  [/^(DESIGN|DESIGNS|IMAGE|ASSET)$/, "visuel"],
  [/^(DEAL|DEALS)$/, "affaire"],
  [/^(CONTACT|CONTACTS|LEAD|LEADS)$/, "contact"],
  [/^(TASK|TASKS|CARD|CARDS|ISSUE|ISSUES)$/, "tâche"],
  [/^(MEETING|MEETINGS)$/, "réunion"],
  [/^(POST|POSTS|TWEET)$/, "publication"],
];
export function toolAction(tool: string, toolkit: string | null): string {
  const prefix = (toolkit ?? "").toUpperCase();
  const words = tool
    .toUpperCase()
    .replace(new RegExp(`^${prefix}_`), "")
    .split("_")
    .filter(Boolean);
  const verb = words
    .map((w) => VERBS.find(([re]) => re.test(w))?.[1])
    .find(Boolean);
  const thing = words
    .map((w) => THINGS.find(([re]) => re.test(w))?.[1])
    .find(Boolean);
  if (!verb) return words.join(" ").toLowerCase() || tool;
  return thing
    ? `${verb} ${/^[aeéiou]/.test(thing) ? "d’" : "de "}${thing}`
    : verb;
}
const memberName = (m: { email: string | null; name: string | null }) =>
  m.name ?? m.email ?? "Sans membre";

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
      apiFetch<CallsPage>(
        `/api/composio-usage/calls?${query(month, member, 1)}`,
      ),
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
  const [detail, setDetail] = useState(false);
  async function download() {
    setExporting(true);
    try {
      const all: Call[] = [];
      let truncated = false;
      for (let page = 1; page <= CSV_MAX_PAGES; page += 1) {
        const res = await apiFetch<CallsPage>(
          `/api/composio-usage/calls?${query(month, member, page)}`,
        );
        all.push(...res.items);
        if (!res.hasMore) break;
        if (page === CSV_MAX_PAGES) truncated = true;
      }
      const lines = [
        ["Date", "Membre", "E-mail", "Application", "Outil", "Résultat"].join(
          ";",
        ),
        ...all.map((c) =>
          [
            new Date(c.occurredAt).toLocaleString("fr-FR"),
            c.name ?? "",
            c.email ?? "",
            c.via === "meta" ? "Recherche d’outils" : toolkitName(c.toolkit),
            c.tool,
            ok(c) ? "Abouti" : "Non abouti",
          ]
            .map(cell)
            .join(";"),
        ),
      ];
      // The BOM lets Excel read the accents.
      const blob = new Blob(["\uFEFF" + lines.join("\r\n")], {
        type: "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `appels-outils-${month}${member ? `-${member.split("@")[0]}` : ""}.csv`;
      document.body.append(a);
      a.click();
      a.remove();
      // Firefox may still be reading the file when click() returns.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      if (truncated)
        toast.warning(
          `Export limité à ${count.format(all.length)} appels. Choisissez un membre pour exporter le reste.`,
        );
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
      .then((o) =>
        setOwnKey(Boolean(o.own) || (o.members ?? []).some((m) => m.own)),
      )
      .catch(() => undefined);
  }, []);

  async function more() {
    if (!calls) return;
    const key = asked.current;
    setLoadingMore(true);
    try {
      const next = await apiFetch<CallsPage>(
        `/api/composio-usage/calls?${query(month, member, calls.page + 1)}`,
      );
      if (asked.current === key)
        setCalls({ ...next, items: [...calls.items, ...next.items] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="max-w-5xl">
      <h1 className="sr-only">Utilisation des outils connectés</h1>
      <p className="mt-1 text-sm text-ink-2">
        Les appels de vos Experts aux outils de l’onglet Connecteurs (Gmail,
        Sheets, HubSpot…). Les outils sur mesure ajoutés dans Serveurs MCP ne sont pas
        encore comptés ici.
      </p>
      {ownKey && (
        <p className="mt-3 max-w-2xl rounded-xl border border-line bg-soft px-4 py-3 text-[13px] text-ink-2">
          Certains Experts utilisent votre propre compte d’IA : cette dépense
          n’apparaît pas ici, consultez-la chez votre fournisseur.
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-end gap-3">
        {/* The browser's month field was English and « archaïque » (Leslie, 06/11): our list, the last 12 months in French. */}
        <div className="text-[13px] font-semibold text-ink-3">
          Mois
          <Picker
            label="Mois"
            placeholder="Ce mois-ci"
            value={month}
            onChange={(v) => {
              setMonth(v);
              setMember("");
            }}
            groups={[{ options: lastMonths(12) }]}
            className="mt-1 flex h-11 w-52 font-normal sm:h-11 sm:text-[15px]"
          />
        </div>
        <div className="text-[13px] font-semibold text-ink-3">
          Membre
          <Picker
            label="Membre"
            placeholder="Tous les membres"
            value={member}
            onChange={setMember}
            groups={[
              {
                options: [
                  { value: "", label: "Tous les membres" },
                  ...members.map((m) => ({
                    value: m.email ?? "",
                    label: memberName(m),
                  })),
                ],
              },
            ]}
            className="mt-1 flex h-11 w-64 font-normal sm:h-11 sm:text-[15px]"
          />
        </div>
        {loading && (
          <Loader2
            className="mb-3 h-4 w-4 animate-spin text-ink-3"
            aria-label="Chargement"
          />
        )}
      </div>

      {error && (
        <p className="mt-4 max-w-xl rounded-xl bg-ko-pale px-4 py-3 text-sm text-ko">
          {error}
        </p>
      )}

      {usage && calls && (
        <>
          <section className="mt-5 rounded-[22px] border border-line bg-surface p-5 sm:p-6">
            <p className="text-[13px] font-semibold text-ink-3">
              Nombre d’appels d’outils
            </p>
            <p className="mt-1 font-display text-[32px] font-bold leading-tight text-ink">
              {count.format(usage.executions)}
            </p>
          </section>

          {usage.executions === 0 && calls.items.length === 0 ? (
            <p className="mt-6 text-sm text-ink-2">
              Aucun appel d’outil sur cette période.
            </p>
          ) : (
            <>
              <div className="mt-8 grid gap-6 lg:grid-cols-2">
                <Breakdown
                  title="Par membre"
                  label="Membre"
                  total={usage.executions}
                  rows={usage.byMember.map((m) => ({
                    ...m,
                    key: m.email ?? "",
                    name: memberName(m),
                  }))}
                />
                <Breakdown
                  title="Par application"
                  label="Application"
                  total={usage.executions}
                  rows={usage.byToolkit.map((t) => ({
                    ...t,
                    key: t.toolkit ?? "",
                    name: toolkitName(t.toolkit),
                  }))}
                />
              </div>

              <div className="mt-8 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  aria-expanded={detail}
                  onClick={() => setDetail((v) => !v)}
                  className="inline-flex min-h-11 items-center gap-1.5 font-display text-lg font-semibold text-ink"
                >
                  Détail des appels
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-ink-3 transition-transform",
                      detail && "rotate-180",
                    )}
                  />
                </button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={download}
                  disabled={exporting}
                  className="gap-1.5"
                >
                  {exporting ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Download />
                  )}
                  Télécharger en CSV
                </Button>
              </div>
              {detail && (
                <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-surface">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="bg-soft text-left text-xs text-ink-3">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">Date</th>
                        <th className="px-4 py-2.5 font-medium">Membre</th>
                        <th className="px-4 py-2.5 font-medium">Application</th>
                        <th className="px-4 py-2.5 font-medium">Action</th>
                        <th className="px-4 py-2.5 font-medium">Résultat</th>
                      </tr>
                    </thead>
                    <tbody>
                      {calls.items.map((c, i) => (
                        <tr
                          key={`${c.occurredAt}-${i}`}
                          className="border-t border-line"
                        >
                          <td className="whitespace-nowrap px-4 py-3 text-ink-2">
                            {moment(c.occurredAt)}
                          </td>
                          <td className="px-4 py-3 text-ink">
                            {memberName(c)}
                          </td>
                          <td className="px-4 py-3 text-ink-2">
                            {c.via === "meta" ? "—" : toolkitName(c.toolkit)}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-ink-2" title={c.tool}>
                              {c.via === "meta"
                                ? "Recherche d’outils"
                                : toolAction(c.tool, c.toolkit)}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {ok(c) ? (
                              <span className="text-ink-2">Abouti</span>
                            ) : (
                              <Badge variant="warning">Non abouti</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {detail && calls.hasMore && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={more}
                  disabled={loadingMore}
                >
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

function Breakdown({
  title,
  label,
  total,
  rows,
}: {
  title: string;
  label: string;
  total: number;
  rows: ({ key: string; name: string } & Count)[];
}) {
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
                  <span
                    aria-hidden
                    className="mt-1.5 block h-1.5 rounded-full bg-soft"
                  >
                    <span
                      className="block h-full rounded-full bg-brand/70"
                      style={{
                        width: `${total ? Math.max(2, Math.round((row.executions / total) * 100)) : 0}%`,
                      }}
                    />
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-ink">
                  {count.format(row.executions)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
