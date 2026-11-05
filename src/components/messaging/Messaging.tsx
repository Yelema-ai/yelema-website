"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { remember, whenKept } from "@/lib/client-cache";
import { optimistic } from "@/lib/optimistic";
import { conversationName, facesOf, isSalonName, labelsOf, myExpertsIn, myMember, participants, working, type BuzzOverview } from "@/lib/buzz";
import { deviceKey, rememberedRelay, storedKey } from "@/lib/buzz-keys";
import { reconnectDelay } from "@/lib/instance-events";
import { BuzzConnection, conversations, follow, openDirect, refusalText, sendMessage, watchRosters, withMessage, type Conversation, type Message } from "@/lib/buzz-relay";
import { cn } from "@/lib/utils";
import { useChatMarks } from "@/components/conversations/useChatMarks";
import { ExchangeRail } from "@/components/messaging/ExchangeRail";
import { ExchangeHeader, type ExchangePane } from "@/components/messaging/ExchangeHeader";
import { ExchangeThread } from "@/components/messaging/ExchangeThread";
import { candidatesOf } from "@/lib/buzz-mentions";
import { NewExchange, type ExchangeKind } from "@/components/messaging/NewExchange";
import { prefetchSalonDeliverables } from "@/components/messaging/salon-deliverables-store";
import { whenIdle } from "@/components/usePrefetch";

// Échanges entre membres, présentés comme le chat d'un Expert : la colonne des échanges, le fil à côté. Lus et
// écrits par ce navigateur sur le relais du client ; le back-office admet la clé de l'appareil et tient les salons.
// Une connexion coupée (veille, réseau) se rouvre seule ; chaque ouverture relit la liste et le fil.

type State = { kind: "loading" } | { kind: "closed"; reason: string } | { kind: "ready" };
const markKey = (id: string) => `echange:${id}`;
// What this device last showed (lib/device-cache-client): the rail and the thread paint before the relay answers.
const OVERVIEW_KEY = "buzz:overview";
const LIST_KEY = "buzz:list";
const threadKey = (id: string) => `buzz:thread:${id}`;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function Messaging() {
  const router = useRouter();
  const params = useSearchParams();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [overview, setOverview] = useState<BuzzOverview | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [list, setList] = useState<Conversation[] | null>(null);
  const [open, setOpenState] = useState<string | null>(params.get("c"));
  const [thread, setThread] = useState<Message[] | null>(null);
  const [threadFailed, setThreadFailed] = useState(false);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [composing, setComposing] = useState<ExchangeKind | null>(null);
  const [pane, setPane] = useState<ExchangePane>("fil");
  const relay = useRef<BuzzConnection | null>(null);
  // Bumped on each (re)connection and on « Actualiser »: the list and the open thread are read again.
  const [link, setLink] = useState(0);
  const dialer = useRef<{ url: string; secret: Uint8Array; dialing: boolean; stopped: boolean } | null>(null);
  const shown = useRef<string | null>(null);
  const { marks, mark } = useChatMarks();

  const labels = useMemo(() => labelsOf(overview?.annuaire ?? []), [overview]);
  const mine = useMemo(() => [...(overview?.appareils.map((d) => d.cle) ?? []), ...(me ? [me] : [])], [overview, me]);
  const unitSalons = useMemo(() => new Set(overview?.salons.map((s) => s.id) ?? []), [overview]);
  const isUnit = useCallback((c: Conversation) => unitSalons.has(c.id), [unitSalons]);
  const isSalon = useCallback((c: Conversation) => unitSalons.has(c.id) || isSalonName(c.name), [unitSalons]);
  const nameOf = useCallback((c: Conversation) => overview?.salons.find((s) => s.id === c.id)?.nom ?? (isSalonName(c.name) ? c.name : conversationName(c.members, mine, labels, "Conversation")), [overview, mine, labels]);
  const countOf = useCallback((c: Conversation) => participants(c.members, mine, labels).length, [mine, labels]);
  const pinned = useMemo(() => new Set(marks.pinned.filter((k) => k.startsWith("echange:")).map((k) => k.slice(8))), [marks]);
  const archived = useMemo(() => new Set(marks.archived.filter((k) => k.startsWith("echange:")).map((k) => k.slice(8))), [marks]);

  const setOpen = useCallback((id: string | null) => {
    setOpenState(id);
    setPane("fil");
    router.replace(id ? `/echanges?c=${id}` : "/echanges", { scroll: false });
  }, [router]);

  const refresh = useCallback(async () => {
    if (!relay.current || !me) return;
    setRefreshing(true);
    try {
      setList(remember(LIST_KEY, await conversations(relay.current, me)));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, [me]);

  // Ouvre le relais, avec quelques essais (une clé qui vient d'être admise attend la synchronisation suivante).
  // Sans limite une fois la page prête : une coupure se répare d'elle-même, jusqu'à 30 s entre deux essais.
  const dial = useCallback(async (attempts: number): Promise<boolean> => {
    const d = dialer.current;
    if (!d || d.dialing) return false;
    d.dialing = true;
    try {
      for (let attempt = 0; attempt < attempts && !d.stopped; attempt++) {
        const c = new BuzzConnection(d.url, d.secret);
        try {
          await c.connect();
        } catch {
          c.close();
          if (attempt + 1 < attempts) await pause(reconnectDelay(attempt));
          continue;
        }
        if (d.stopped) return (c.close(), false);
        c.onclose = () => {
          if (relay.current !== c) return;
          relay.current = null;
          void dial(Infinity);
        };
        relay.current = c;
        setLink((l) => l + 1);
        return true;
      }
      return false;
    } finally {
      d.dialing = false;
    }
  }, []);

  // Ouverture : la vue du back-office et, en même temps, le relais de la dernière visite avec la clé déjà tenue ;
  // la clé n'est envoyée au back-office que si elle n'y est pas encore admise.
  useEffect(() => {
    let stop = false;
    const held = storedKey();
    const known = rememberedRelay();
    dialer.current = held && known ? { url: known, secret: held.secret, dialing: false, stopped: false } : null;
    const early = dialer.current ? dial(1) : Promise.resolve(false);
    const offKept = [
      whenKept<BuzzOverview>(OVERVIEW_KEY, (o) => !stop && setOverview((p) => p ?? o)),
      whenKept<Conversation[]>(LIST_KEY, (l) => !stop && setList((p) => p ?? l)),
    ];
    (async () => {
      try {
        const o = await apiFetch<BuzzOverview>("/api/buzz");
        if (stop) return;
        rememberedRelay(o.relais);
        setOverview(remember(OVERVIEW_KEY, o));
        const key = await deviceKey(o.appareils.map((d) => d.cle));
        if (stop) return;
        setMe(key.pubkey);
        if (o.relais === known && key.pubkey === held?.pubkey && (await early) && relay.current) {
          if (!stop) setState({ kind: "ready" });
          return;
        }
        if (dialer.current) dialer.current.stopped = true;
        await early;
        relay.current?.close();
        relay.current = null;
        if (stop) return;
        dialer.current = { url: o.relais, secret: key.secret, dialing: false, stopped: false };
        if (await dial(8)) setState({ kind: "ready" });
        else if (!stop) setState({ kind: "closed", reason: "Votre accès aux Salons est en cours d’activation. Réessayez dans une minute." });
      } catch (e) {
        if (!stop) setState({ kind: "closed", reason: e instanceof Error ? e.message : "Les Salons ne sont pas disponibles." });
      }
    })();
    return () => {
      stop = true;
      offKept.forEach((off) => off());
      if (dialer.current) dialer.current.stopped = true;
      relay.current?.close();
      relay.current = null;
    };
  }, [dial]);

  useEffect(() => {
    void refresh();
  }, [refresh, link]);

  // Une conversation créée ou modifiée ailleurs apparaît d'elle-même, sans « Actualiser ».
  useEffect(() => {
    const c = relay.current;
    if (!c || !me) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const watch = watchRosters(c, me, () => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 300);
    });
    return () => {
      clearTimeout(timer);
      watch.close();
    };
  }, [me, link, refresh]);

  // « Actualiser » : l'annuaire (participants, portraits), puis la liste et le fil ; la connexion d'abord si elle est tombée.
  async function reload() {
    setRefreshing(true);
    try {
      const fresh = apiFetch<BuzzOverview>("/api/buzz").then((o) => setOverview(remember(OVERVIEW_KEY, o)), () => undefined);
      if (relay.current) setLink((l) => l + 1);
      else if (!(await dial(1))) toast.error("Le relais ne répond pas. Nouvel essai dans un instant.");
      await fresh;
    } finally {
      setRefreshing(false);
    }
  }

  // Le fil ouvert puis chaque nouveau message, dans une seule requête restée ouverte.
  useEffect(() => {
    if (!open) return;
    if (shown.current !== open) setThread(null);
    // Avant le relais : le fil tel que cet appareil l'a vu, remplacé dès que le relais répond.
    return whenKept<Message[]>(threadKey(open), (m) => shown.current !== open && setThread((t) => t ?? m));
  }, [open]);

  useEffect(() => {
    const c = relay.current;
    if (!c || !open) return;
    let stop = false;
    setThreadFailed(false);
    const sub = follow(c, open, {
      onLoad: (m) => {
        if (stop) return;
        shown.current = open;
        setThread(remember(threadKey(open), m.slice(-40)));
      },
      onLive: (m) => !stop && setThread((t) => withMessage(t, m)),
      // Une connexion muette est rouverte d'elle-même (puis le fil relu) ; d'ici là, « Réessayer ».
      onError: () => !stop && setThreadFailed(true),
    });
    return () => {
      stop = true;
      sub.close();
    };
  }, [open, me, link]);

  const current = list?.find((c) => c.id === open) ?? null;
  // Les livrables d'un salon lus dès son ouverture : l'onglet s'affiche sans attendre.
  const salonOpen = current && isSalon(current) ? current.id : null;
  useEffect(() => {
    if (salonOpen) whenIdle(() => prefetchSalonDeliverables(salonOpen));
  }, [salonOpen]);
  const directory = useMemo(() => overview?.annuaire ?? [], [overview]);
  const askable = useMemo(() => (current && isSalon(current) ? myExpertsIn(directory, mine, current.members) : []), [current, isSalon, directory, mine]);
  const busy = useMemo(() => working(thread ?? [], mine, askable), [thread, mine, askable]);
  const candidates = useMemo(() => {
    if (!current) return [];
    const all = candidatesOf(directory, current.members, myMember(directory, mine), mine);
    // Hors salon, vos Experts ne travaillent pas sur mention : ils restent de simples participants.
    return isSalon(current) ? all : all.map((c) => ({ ...c, mine: false }));
  }, [current, directory, mine, isSalon]);

  async function send(text: string, mentions: string[], replyTo: Message | null): Promise<boolean> {
    const c = relay.current;
    if (!c || !open) return false;
    setSending(true);
    try {
      const r = await sendMessage(c, open, text, replyTo, mentions, thread ?? []);
      if (!r.ok) throw new Error(refusalText(r.message));
      const recipients = (current?.members ?? []).filter((k) => !mine.includes(k));
      void apiFetch("/api/buzz/sent", { method: "POST", body: JSON.stringify({ kind: replyTo ? "reply" : current && isSalon(current) ? "salon" : "dm", recipients }) }).catch(() => undefined);
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setSending(false);
    }
  }

  async function start(kind: ExchangeKind, keys: string[], name: string) {
    const c = relay.current;
    if (!c) return;
    if (kind === "ajout") {
      if (!open) return;
      const salon = open;
      const before = list?.find((x) => x.id === salon)?.members ?? null;
      const members = (m: string[] | null) => m && setList((l) => l?.map((x) => (x.id === salon ? { ...x, members: m } : x)) ?? l);
      setComposing(null);
      // Affichés tout de suite ; retirés, avec le refus, si le back-office ne les admet pas.
      const ok = await optimistic({
        apply: () => members(before && [...new Set([...before, ...keys])]),
        run: () => apiFetch(`/api/buzz/salons/${salon}/membres`, { method: "POST", body: JSON.stringify({ cles: keys }) }, "Les participants n’ont pas pu être ajoutés"),
        rollback: () => members(before),
        refused: (m) => toast.error(m),
      });
      if (!ok) return;
      // Les personnes ajoutées sont prévenues (« X vous a ajouté au salon Y ») ; jamais bloquant.
      const named = list?.find((x) => x.id === salon);
      notifyAdded(keys, salon, named ? nameOf(named) : "");
      toast.success("Participants ajoutés. Leurs Experts écoutent le salon d’ici une minute.");
      await refresh();
      return;
    }
    const id =
      kind === "salon"
        ? (await apiFetch<{ id: string }>("/api/buzz/salons", { method: "POST", body: JSON.stringify({ nom: name, cles: keys }) }, "Le salon n’a pas pu être créé")).id
        : await openDirect(c, [...new Set([...mine.filter((k) => k !== me), ...keys])]);
    setComposing(null);
    await refresh();
    setOpen(id);
    if (kind === "salon") notifyAdded(keys, id, name);
    if (kind === "message") void apiFetch("/api/buzz/sent", { method: "POST", body: JSON.stringify({ kind: "dm", recipients: keys }) }).catch(() => undefined);
  }

  // Seules les personnes sont prévenues : un Expert ajouté écoute le salon, il n'a pas de cloche.
  function notifyAdded(keys: string[], salon: string, nom: string) {
    const people = keys.filter((k) => directory.some((e) => e.type === "personne" && e.cles.includes(k)));
    if (people.length) void apiFetch("/api/buzz/sent", { method: "POST", body: JSON.stringify({ kind: "ajout", recipients: people, salon, nom }) }).catch(() => undefined);
  }

  async function rename(c: Conversation, nom: string) {
    const was = overview?.salons.find((s) => s.id === c.id)?.nom ?? null;
    const named = (n: string | null) => {
      setList((l) => l?.map((x) => (x.id === c.id ? { ...x, name: n ?? c.name } : x)) ?? l);
      setOverview((o) => (o && was !== null ? { ...o, salons: o.salons.map((s) => (s.id === c.id ? { ...s, nom: n ?? was } : s)) } : o));
    };
    const ok = await optimistic({
      apply: () => named(nom),
      run: () => apiFetch(`/api/buzz/salons/${c.id}`, { method: "PATCH", body: JSON.stringify({ nom }) }, "Le salon n’a pas pu être renommé"),
      rollback: () => named(was),
      refused: (m) => toast.error(m),
    });
    if (ok) await refresh();
  }

  // Lève l'erreur : la fenêtre de confirmation l'affiche et reste ouverte.
  async function remove(c: Conversation) {
    await apiFetch(`/api/buzz/salons/${c.id}`, { method: "DELETE" }, "Le salon n’a pas pu être supprimé");
    if (open === c.id) setOpen(null);
    toast.success("Salon supprimé.");
    await refresh();
  }

  async function copyLink(c: Conversation) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/echanges?c=${c.id}`);
      toast.success("Lien copié : il ouvre cette conversation pour ses participants.");
    } catch {
      toast.error("Le lien n’a pas pu être copié.");
    }
  }

  if (state.kind === "closed") return <p className="m-6 max-w-xl rounded-xl bg-ko-pale px-4 py-3 text-sm text-ko">{state.reason}</p>;

  const kind = current ? (isUnit(current) ? "unite" : isSalon(current) ? "salon" : "direct") : null;
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <ExchangeHeader
        title={current ? nameOf(current) : null}
        kind={kind}
        pane={pane}
        canAdd={kind === "salon"}
        onPane={setPane}
        onBack={() => setOpen(null)}
        onAdd={() => setComposing("ajout")}
        onLivrablesIntent={() => salonOpen && prefetchSalonDeliverables(salonOpen)}
      />
      <div className="flex min-h-0 flex-1">
      <div className={cn("w-full shrink-0 flex-col border-r border-line bg-surface px-2.5 py-3 lg:flex lg:w-[300px]", open ? "hidden" : "flex")}>
        <ExchangeRail
          list={list}
          open={open}
          ready={state.kind === "ready"}
          refreshing={refreshing}
          pinned={pinned}
          archived={archived}
          nameOf={nameOf}
          isSalon={isSalon}
          isUnit={isUnit}
          countOf={countOf}
          facesOf={(c) => facesOf(directory, c.members, mine)}
          onOpen={setOpen}
          onNew={setComposing}
          onRefresh={() => void reload()}
          onMark={(id, kind, on) => mark(markKey(id), kind, on)}
          onCopy={(c) => void copyLink(c)}
          onRename={rename}
          onDelete={remove}
        />
      </div>
      <section className={cn("min-w-0 flex-1 flex-col bg-surface lg:flex", open ? "flex" : "hidden")}>
        <ExchangeThread
          current={current}
          salon={kind === "unite" || kind === "salon"}
          pane={pane}
          thread={thread}
          mine={mine}
          labels={labels}
          directory={directory}
          failed={threadFailed}
          onRetry={() => void reload()}
          busy={busy}
          candidates={candidates}
          sending={sending}
          onSend={send}
        />
      </section>
      </div>
      <NewExchange kind={composing} onClose={() => setComposing(null)} directory={directory} mine={mine} onStart={start} onSalon={() => setComposing("salon")} />
    </div>
  );
}
