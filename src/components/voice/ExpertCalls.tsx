"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Copy, Download, Loader2, Mail, MessageCircle, PhoneCall, RefreshCw, Search, Share2, X } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { usePoll } from "@/components/usePoll";
import { callDuration, callShareText, findInText, frenchSpacing, summarySections, transcriptOf, type CallRecord } from "@/lib/voice";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { BackButton } from "@/components/ui/back-button";
import { CallButton } from "./CallButton";

// The "Appels" tab of an expert: the member's calls with it, newest first, as a list across the page;
// a call opens its own page (as in Fireflies): a compact header (« ‹ Appels », title, Rappeler), then
// one surface: the summary in document style on the left (its sections when the back office serves
// them, else one « Résumé »), the transcript in a side panel on the right, full height and scrolling on
// its own; its search highlights and walks the matches, never hides a line. On a phone, one under the other.
// The transcript is only lines the back office chose to serve (`transcript`, not served yet), never
// the raw transcript handed to the expert in its session. Pending ones are read again shortly.

const PENDING_POLL_MS = 15_000;

type Expert = { key: string; name: string; photoUrl: string | null };

const when = (iso: string) => {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? "" : at.toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

const titleOf = (c: CallRecord) =>
  c.subject ?? (c.status === "open" ? "Appel en cours" : c.subjectPending ? "Compte rendu en cours de rédaction…" : c.status === "failed" ? "Appel interrompu" : "Sans sujet");

const metaOf = (c: CallRecord) =>
  [when(c.startedAt), c.durationSeconds != null ? callDuration(c.durationSeconds) : "", c.language === "en" ? "en anglais" : ""].filter(Boolean).join(" · ");

export function ExpertCalls({ expert }: { expert: Expert }) {
  const [calls, setCalls] = useState<CallRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The call whose page is open rides the URL (?appel=<id>), so the browser's Back returns to the
  // list and a call's page can be reloaded or shared. « Voir le résumé » at the end of a call lands
  // with ?appel=dernier: the newest call.
  const wanted = useSearchParams().get("appel");
  const openId = wanted === "dernier" ? (calls?.[0]?.id ?? null) : wanted;
  const setOpenId = (id: string | null) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("appel", id);
    else url.searchParams.delete("appel");
    window.history.pushState(null, "", url.pathname + url.search);
  };

  const load = useCallback(async () => {
    try {
      const r = await apiFetch<{ items: CallRecord[] }>(`/api/voice/calls?expert=${encodeURIComponent(expert.key)}`);
      setCalls(r.items);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [expert.key]);

  useEffect(() => {
    void load();
  }, [load]);

  const pending = calls?.some((c) => c.subjectPending || c.status === "open") ?? false;
  usePoll(load, { everyMs: PENDING_POLL_MS, immediate: false, enabled: pending });

  const shown = calls?.find((c) => c.id === openId) ?? null;
  if (shown) return <CallPage call={shown} expert={expert} onBack={() => setOpenId(null)} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {/* « Appeler » heads the page already: one button, not two. */}
        <h2 className="sr-only">Appels avec {expert.name}</h2>
        {calls?.length !== 0 && (
          <>
            <p className="mr-auto text-sm text-ink-3">Le résumé et la transcription de chaque appel avec {expert.name}.</p>
            <Button variant="ghost" size="sm" onClick={() => void load()} aria-label="Actualiser">
              <RefreshCw />
            </Button>
          </>
        )}
      </div>

      {error && <p className="text-sm text-ko">{error}</p>}
      {!calls && !error && (
        <p className="flex items-center gap-2 text-sm text-ink-3">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
        </p>
      )}
      {/* No call yet: the call itself, in the middle, not only at the top of the page (Leslie, 27/10). */}
      {calls?.length === 0 && (
        <div className="flex flex-col items-center gap-1 rounded-2xl border border-line bg-surface px-6 py-9 text-center">
          <p className="text-[15px] font-semibold text-ink">Parlez à {expert.name} de vive voix</p>
          <p className="mb-4 text-sm text-ink-3">Le résumé de l’appel arrive ici.</p>
          <CallButton expert={expert} label={`Appeler ${expert.name}`} primary />
        </div>
      )}
      {calls && calls.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface" aria-label="Appels">
          {calls.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => setOpenId(c.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-soft">
                <PhoneCall className="h-4 w-4 shrink-0 text-ink-3" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{titleOf(c)}</span>
                  <span className="block text-[12px] text-ink-3">{metaOf(c)}</span>
                  {c.summary?.[0] && <span className="mt-0.5 block truncate text-[13px] text-ink-2">{c.summary[0]}</span>}
                </span>
                <ChevronRight className="size-4 shrink-0 text-ink-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CallPage({ call: c, expert, onBack }: { call: CallRecord; expert: Expert; onBack: () => void }) {
  const lines = transcriptOf(c);
  const sections = summarySections(c);
  const me = useWorkspace();
  const myInitial = (me.userFirstName ?? me.userName ?? "V").trim().charAt(0).toUpperCase() || "V";

  // Search highlights and walks the matches; it never hides a line.
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState(0);
  const ranges = lines.map((l) => findInText(l.text, query));
  const total = ranges.reduce((n, r) => n + r.length, 0);
  const panel = useRef<HTMLDivElement>(null);
  const step = (d: number) => total && setCurrent((i) => (i + d + total) % total);

  useEffect(() => setCurrent(0), [query]);
  useEffect(() => {
    const box = panel.current;
    const hit = box?.querySelector<HTMLElement>(`[data-hit="${current}"]`);
    if (!box || !hit) return;
    // In its own column on a wide screen (only if the match is out of view); the page itself on a phone.
    if (getComputedStyle(box).overflowY === "auto") {
      const top = hit.offsetTop;
      if (top < box.scrollTop || top > box.scrollTop + box.clientHeight - 24) box.scrollTo({ top: top - box.clientHeight / 2, behavior: "smooth" });
    } else hit.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [current, query, total]);

  let seen = 0;
  return (
    <section className="flex min-w-0 flex-col gap-5" aria-label={titleOf(c)}>
      <header className="flex flex-wrap items-start gap-3 border-b border-line pb-4">
        <div className="min-w-0 flex-1">
          <BackButton label="Tous les appels" onClick={onBack} className="mb-3" />
          <h2 className="text-lg font-bold text-ink">{titleOf(c)}</h2>
          <p className="text-[12px] text-ink-3">{metaOf(c)}</p>
        </div>
        <div className="flex items-center gap-2">
          <ShareCall call={c} expert={expert} memberName={me.userFirstName ?? me.userName ?? "Vous"} />
          <CallButton expert={expert} label="Rappeler" />
        </div>
      </header>

      <div className="grid items-start md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-6 pb-6 md:pr-8">
          {sections ? (
            sections.map((sec) => <SummaryBlock key={sec.title} title={sec.title} items={sec.items} />)
          ) : c.summary?.length ? (
            <SummaryBlock title="Résumé" items={c.summary} />
          ) : (
            <SummaryBlock title="Résumé" empty={c.subjectPending || c.status === "open" ? "Le résumé arrive dès que l’appel est terminé." : "Pas de résumé pour cet appel."} />
          )}
        </div>

        <aside
          className="flex min-w-0 flex-col border-t border-line pt-4 md:sticky md:top-0 md:h-[calc(100dvh-9rem)] md:border-t-0 md:border-l md:pt-0 md:pl-6"
          aria-label="Transcription"
        >
          <div className="flex min-h-10 items-center gap-2">
            <h3 className="text-[13px] font-bold uppercase tracking-wide text-ink-3">Transcription</h3>
            {lines.length > 0 && !searching && (
              <button
                type="button"
                onClick={() => setSearching(true)}
                aria-label="Rechercher dans la transcription"
                className="ml-auto grid size-9 place-items-center rounded-full text-ink-3 hover:bg-soft hover:text-ink"
              >
                <Search className="size-4" />
              </button>
            )}
          </div>
          {searching && (
            <div className="flex min-w-0 items-center gap-1">
              <label className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 text-[13px] focus-within:border-brand">
                <Search className="size-3.5 shrink-0 text-ink-3" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      step(e.shiftKey ? -1 : 1);
                    } else if (e.key === "Escape") {
                      setQuery("");
                      setSearching(false);
                    }
                  }}
                  placeholder="Rechercher"
                  aria-label="Rechercher dans la transcription"
                  className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-3"
                />
              </label>
              <span className="w-9 shrink-0 text-center text-[12px] tabular-nums text-ink-3" aria-live="polite">
                {query.trim() ? (total ? `${current + 1}/${total}` : "0") : ""}
              </span>
              <button
                type="button"
                onClick={() => step(-1)}
                disabled={!total}
                aria-label="Résultat précédent"
                className="grid size-8 place-items-center rounded-full text-ink-3 hover:bg-soft disabled:opacity-40"
              >
                <ChevronUp className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                disabled={!total}
                aria-label="Résultat suivant"
                className="grid size-8 place-items-center rounded-full text-ink-3 hover:bg-soft disabled:opacity-40"
              >
                <ChevronDown className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setSearching(false);
                }}
                aria-label="Fermer la recherche"
                className="grid size-8 place-items-center rounded-full text-ink-3 hover:bg-soft"
              >
                <X className="size-4" />
              </button>
            </div>
          )}
          <div ref={panel} className="relative mt-2 min-h-0 flex-1 md:overflow-y-auto md:pr-1">
            {lines.length ? (
              <ol className="flex flex-col gap-4 pb-4">
                {lines.map((l, k) => {
                  const first = seen;
                  seen += ranges[k].length;
                  const isExpert = l.who === "expert";
                  return (
                    <li key={k} className="flex gap-3">
                      <span
                        className={cn(
                          "grid size-8 shrink-0 place-items-center overflow-hidden rounded-full text-[13px] font-bold",
                          isExpert ? "bg-tint text-brand-ink" : "bg-soft-2 text-ink",
                        )}
                      >
                        {isExpert && expert.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={expert.photoUrl} alt="" className="size-full object-cover object-[50%_18%]" />
                        ) : isExpert ? (
                          expert.name.charAt(0)
                        ) : (
                          myInitial
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-baseline gap-2 text-[12px]">
                          <b className={cn("font-semibold", isExpert ? "text-brand-ink" : "text-ink")}>{isExpert ? expert.name : "Vous"}</b>
                          {l.at != null && <span className="tabular-nums text-ink-3">{clockOf(l.at)}</span>}
                        </p>
                        <p className="text-sm leading-relaxed text-ink-2">
                          <Marked text={l.text} ranges={ranges[k]} first={first} current={current} />
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="text-sm text-ink-3">Pas de transcription pour cet appel.</p>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}

const clockOf = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// « Partager » : the call's account as text. On a phone, the system's own sheet (WhatsApp, e-mail…);
// elsewhere, a menu: copy, e-mail, WhatsApp, or a .txt file. Nothing goes through Yelema.
function ShareCall({ call: c, expert, memberName }: { call: CallRecord; expert: Expert; memberName: string }) {
  const title = titleOf(c);
  const text = () => callShareText(c, { title, meta: metaOf(c), expertName: expert.name, memberName });
  const touch = typeof window !== "undefined" && typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches;
  const label = <><Share2 /> <span className="max-sm:sr-only">Partager</span></>;
  if (touch)
    return (
      <Button variant="outline" onClick={() => void navigator.share({ title: `Appel avec ${expert.name}`, text: text() }).catch(() => {})}>
        {label}
      </Button>
    );
  const copy = () =>
    navigator.clipboard.writeText(text()).then(
      () => toast.success("Compte rendu copié"),
      () => toast.error("La copie n’a pas marché.")
    );
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text()], { type: "text/plain;charset=utf-8" }));
    a.download = `Appel ${expert.name} ${c.startedAt.slice(0, 10)}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const item = "gap-2.5 rounded-[10px] px-2.5 py-2 text-sm";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">{label}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 p-1.5">
        <DropdownMenuItem className={item} onSelect={() => void copy()}>
          <Copy className="size-4" /> Copier le compte rendu
        </DropdownMenuItem>
        <DropdownMenuItem className={item} onSelect={() => window.open(`mailto:?subject=${encodeURIComponent(`Appel avec ${expert.name} : ${title}`)}&body=${encodeURIComponent(text())}`, "_self")}>
          <Mail className="size-4" /> Envoyer par e-mail
        </DropdownMenuItem>
        <DropdownMenuItem className={item} onSelect={() => window.open(`https://wa.me/?text=${encodeURIComponent(text())}`, "_blank", "noopener")}>
          <MessageCircle className="size-4" /> Envoyer sur WhatsApp
        </DropdownMenuItem>
        <DropdownMenuItem className={item} onSelect={download}>
          <Download className="size-4" /> Télécharger (.txt)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SummaryBlock({ title, items, empty }: { title: string; items?: string[]; empty?: string }) {
  return (
    <div>
      <h3 className="mb-2 text-[13px] font-bold uppercase tracking-wide text-ink-3">{title}</h3>
      {items?.length ? (
        <ul className="list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-ink marker:text-ink-3">
          {items.map((line, k) => (
            <li key={k}>{frenchSpacing(line)}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-3">{empty}</p>
      )}
    </div>
  );
}

function Marked({ text, ranges, first, current }: { text: string; ranges: [number, number][]; first: number; current: number }) {
  if (!ranges.length) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let at = 0;
  ranges.forEach(([s, e], k) => {
    const n = first + k;
    parts.push(
      <Fragment key={`t${k}`}>{text.slice(at, s)}</Fragment>,
      <mark key={`m${k}`} data-hit={n} className={cn("rounded px-0.5 text-ink", n === current ? "bg-[#F5B83D]/60" : "bg-tint")}>
        {text.slice(s, e)}
      </mark>,
    );
    at = e;
  });
  parts.push(<Fragment key="end">{text.slice(at)}</Fragment>);
  return <>{parts}</>;
}
