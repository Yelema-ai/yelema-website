"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useShownPath } from "@/components/app/NavProgress";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Blocks,
  ChevronDown,
  Lock,
  MessagesSquare,
  PanelLeftClose,
  Search,
  SquarePen,
  Pin,
  Plus,
  UsersRound,
} from "lucide-react";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { EnterpriseSidebar } from "@/components/enterprise/EnterpriseSidebar";
import { usePublicConfig } from "@/components/PublicConfigProvider";
import { AccountMenu } from "@/components/AccountMenu";
import { useExpertsContext } from "@/components/experts/ExpertsProvider";
import { ExpertItem } from "@/components/experts/ExpertItem";
import { ExpertAvatar } from "@/components/experts/ExpertAvatar";
import { READ_AHEAD, useReadAhead, useWarmMenu } from "@/components/experts/expert-preload";
import { useOwnAgentId } from "@/components/conversations/useAllConversations";
import { useChatMarks } from "@/components/conversations/useChatMarks";
import { arrange } from "@/lib/chat-marks";
import { convKey, toMs } from "@/lib/activity";
import { openSearch, warmSearch } from "@/components/conversations/SearchDialog";
import { useCompanySessions } from "@/components/conversations/useCompanySessions";
import type { Expert } from "@/lib/types";
import { cycleKind, expertRank, isDjeneba } from "@/lib/expert-cycle";
import { cn } from "@/lib/utils";
import { expertPath } from "@/lib/expert-tabs";

// Le haut du menu : « Nouvelle conversation » (l'accueil et sa barre de chat), en couleur, puis
// Rechercher (Ctrl K) et Intégrations. Recruter n'est plus au menu (Leslie, 23/10) ; sa page reste à
// son adresse. Une entrée n'apparaît ici que lorsque son écran existe.

type SidebarProps = { collapsed: boolean; onToggle: () => void; onNavigate?: () => void };

/** The company chat's menu for a member who has only that; the Experts' menu for everyone else. */
export function Sidebar(props: SidebarProps) {
  const { current } = useWorkspace();
  return current?.access === "entreprise" ? <EnterpriseSidebar {...props} /> : <ExpertsSidebar {...props} />;
}

function ExpertsSidebar({ collapsed, onToggle, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const { echanges } = usePublicConfig();
  // Lit at the click, before the next page is there.
  const here = useShownPath();
  const { current } = useWorkspace();
  // The company's main logo first (« Entreprise »), then the deployment's, then the initial.
  // Never the Yelema Y here: it is only the tab icon (favicon), Yelema stays in « Powered by ».
  const deploymentLogo = usePublicConfig().logoUrl;
  const logoUrl = current?.logo_url ?? deploymentLogo;
  const { experts: installed, unreadable } = useExpertsContext();
  // Djénéba heads « Mes Experts », always in sight; the others follow the catalogue, cycle by cycle.
  const experts = [...installed].sort((a, b) => expertRank(a) - expertRank(b));
  const ownAgentId = useOwnAgentId();
  // The first Experts as the menu shows them are read ahead: page, conversations and models.
  const shown = groupByCycle(experts).flatMap((g) => g.experts);
  const ahead = new Set(shown.slice(0, READ_AHEAD).map((e) => `${e.agentId}:${e.profileId}`));
  useReadAhead(shown);
  useWarmMenu(ownAgentId, shown);
  // Each cycle the member folded (true) or opened (false), remembered per browser. Past FOLD_FROM Experts,
  // a cycle they never touched starts folded, except the one of the Expert on screen (Leslie, 01/11 : gagner
  // de la place à gauche sans perdre l'accès en un clic).
  const [cycleChoice, setCycleChoice] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      const old: string[] = JSON.parse(localStorage.getItem("yelema.cycles-folded") ?? "[]");
      const saved: Record<string, boolean> = JSON.parse(localStorage.getItem(CYCLES_KEY) ?? "{}");
      setCycleChoice({ ...Object.fromEntries(old.map((k) => [k, true])), ...saved });
    } catch {}
  }, []);
  const toggleCycle = (key: string, folded: boolean) =>
    setCycleChoice((prev) => {
      const next = { ...prev, [key]: !folded };
      try {
        localStorage.setItem(CYCLES_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  const isActive = (e: { agentId: string; profileId: string }) =>
    here === expertPath(e.agentId, e.profileId) || here.startsWith(`${expertPath(e.agentId, e.profileId)}/`);

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-screen flex-col gap-0.5 border-r border-line bg-surface px-3 py-3.5",
        collapsed && "px-2.5 items-center"
      )}
    >
      <div className={cn("flex items-center gap-1", collapsed && "flex-col")}>
        <Link href="/" className={cn("flex min-w-0 items-center gap-2.5 pt-1.5 pb-3.5", collapsed ? "justify-center" : "flex-1 px-2")}>
          {logoUrl ? (
            // Le logo du client. Yelema reste en pied, en « Powered by ». Entier, jamais rogné : contenu dans
            // sa case, avec une petite marge, menu ouvert ou replié.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="size-10 shrink-0 rounded-xl bg-surface object-contain p-0.5" />
          ) : (
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand font-display text-lg font-bold text-on-brand">
              {(current?.name?.trim()[0] ?? "?").toUpperCase()}
            </span>
          )}
          {!collapsed && (
            <span className="min-w-0">
              <b className="block truncate text-[15px] text-ink">{current?.name ?? "…"}</b>
              <span className="block text-[11px] text-ink-3">Espace de travail</span>
            </span>
          )}
        </Link>
        <button
          onClick={onToggle}
          aria-label={collapsed ? "Déplier le menu" : "Replier le menu"}
          title={collapsed ? "Déplier le menu" : "Replier le menu"}
          className={cn("grid size-10 shrink-0 place-items-center rounded-[11px] text-ink-2 hover:bg-soft hover:text-ink", !collapsed && "mb-2")}
        >
          <PanelLeftClose className={cn("size-5", collapsed && "-scale-x-100")} />
        </button>
      </div>

      <Link
        href="/"
        onClick={onNavigate}
        title="Nouvelle conversation"
        className={cn(
          "mb-1.5 flex min-h-11 items-center gap-2.5 rounded-xl bg-brand px-3 text-sm font-semibold text-on-brand transition-opacity hover:opacity-90",
          collapsed && RAIL_SQUARE
        )}
      >
        <SquarePen className="size-5 shrink-0" strokeWidth={1.9} />
        {!collapsed && "Nouvelle conversation"}
      </Link>
      <button
        type="button"
        onClick={openSearch}
        onPointerEnter={warmSearch}
        onFocus={warmSearch}
        title="Rechercher (Ctrl K)"
        className={cn("flex min-h-10 items-center gap-2.5 rounded-[11px] px-2.5 text-sm font-semibold transition-colors text-ink-2 hover:bg-soft", collapsed && RAIL_SQUARE)}
      >
        <Search className="size-5 shrink-0" strokeWidth={1.9} />
        {!collapsed && (
          <>
            Rechercher
            <kbd className="ml-auto rounded-md max-md:hidden border border-line px-1.5 py-0.5 font-sans text-[11px] font-medium text-ink-3">Ctrl K</kbd>
          </>
        )}
      </button>
      <Link
        href="/integrations"
        onClick={onNavigate}
        className={cn(
          "flex min-h-10 items-center gap-2.5 rounded-[11px] px-2.5 text-sm font-semibold transition-colors",
          here.startsWith("/integrations") ? "bg-soft-2 text-ink" : "text-ink-2 hover:bg-soft",
          collapsed && RAIL_SQUARE
        )}
      >
        <Blocks className="size-5 shrink-0" strokeWidth={1.9} />
        {!collapsed && "Intégrations"}
      </Link>
      {echanges && (
        <Link
          href="/echanges"
          onClick={onNavigate}
          className={cn(
            "flex min-h-10 items-center gap-2.5 rounded-[11px] px-2.5 text-sm font-semibold transition-colors",
            here.startsWith("/echanges") ? "bg-soft-2 text-ink" : "text-ink-2 hover:bg-soft",
            collapsed && RAIL_SQUARE
          )}
        >
          <MessagesSquare className="size-5 shrink-0" strokeWidth={1.9} />
          {!collapsed && "Salons"}
        </Link>
      )}
      {current?.access === "equipe" && (
        <Link
          href="/equipe"
          onClick={onNavigate}
          className={cn(
            "flex min-h-10 items-center gap-2.5 rounded-[11px] px-2.5 text-sm font-semibold transition-colors",
            here.startsWith("/equipe") ? "bg-soft-2 text-ink" : "text-ink-2 hover:bg-soft",
            collapsed && RAIL_SQUARE
          )}
        >
          <UsersRound className="size-5 shrink-0" strokeWidth={1.9} />
          {!collapsed && "Mon équipe"}
        </Link>
      )}

      {/* The Experts and the conversations scroll between the top of the menu and its foot, which stay put. */}
      <div className={cn("-mx-3 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3", collapsed && "-mx-2.5 items-center px-2.5")}>
      {/* An employee with the company chat only has no Experts: no empty heading then. */}
      {collapsed && experts.length > 0 && <div className="my-2 h-px w-8 shrink-0 bg-line" aria-hidden />}
      {!collapsed && experts.length > 0 && (
        <div className="px-2.5 pt-4 pb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">Mes Experts</div>
      )}

      {groupByCycle(experts).map((g) => {
        const folded =
          !collapsed && g.cycle !== null && (cycleChoice[g.cycle.key] ?? (experts.length > FOLD_FROM && !g.experts.some(isActive)));
        // Folded, a cycle shows the faces of its Experts instead of a count (Leslie, 02/11, option C).
        return (
          <div key={g.cycle?.key ?? (g.experts.some(isDjeneba) ? "_lead" : "_rest")} className="flex flex-col gap-0.5">
            {/* The cycle a group of Experts came with: one quiet line, folding the group. */}
            {g.cycle && !collapsed && (
              <button
                type="button"
                onClick={() => toggleCycle(g.cycle!.key, folded)}
                aria-expanded={!folded}
                className="flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 pt-2 text-left text-[12px] font-semibold text-ink-3 hover:text-ink"
              >
                {(() => {
                  const Icon = cycleKind(g.cycle.label).icon;
                  return <Icon className="size-3.5 shrink-0" />;
                })()}
                <span className="min-w-0 flex-1 truncate">{g.cycle.label}</span>
                {folded ? (
                  <span className="flex shrink-0 items-center" aria-label={`${g.experts.length} Expert${g.experts.length > 1 ? "s" : ""}`}>
                    {g.experts.slice(0, FACES).map((e) => (
                      <ExpertAvatar
                        key={`${e.agentId}:${e.profileId}`}
                        expert={{ ...e, gateway: null }}
                        size="xxs"
                        className="-ml-2 rounded-full ring-2 ring-surface first:ml-0"
                      />
                    ))}
                    {g.experts.length > FACES && <span className="ml-1 text-[11px] font-semibold">+{g.experts.length - FACES}</span>}
                  </span>
                ) : (
                  <ChevronDown className="size-3.5 shrink-0" />
                )}
              </button>
            )}
            {!folded &&
              g.experts.map((e) => (
                <ExpertItem
                  // Keyed on instance and profile: a profile name alone is not unique across instances.
                  key={`${e.agentId}:${e.profileId}`}
                  expert={e}
                  active={isActive(e)}
                  compact={collapsed}
                  onNavigate={onNavigate}
                  readAhead={ahead.has(`${e.agentId}:${e.profileId}`)}
                  className={g.cycle && !collapsed ? "pl-4" : undefined}
                  showCycle={!g.cycle}
                />
              ))}
          </div>
        );
      })}

      {/* Une instance illisible ne doit pas raccourcir la liste en silence. */}
      {!collapsed && unreadable > 0 && (
        <p className="px-2.5 py-1.5 text-xs text-ink-3">
          {unreadable === 1 ? "1 instance illisible" : `${unreadable} instances illisibles`}
        </p>
      )}

      {!collapsed && ownAgentId && <CompanyChats agentId={ownAgentId} pathname={pathname} onNavigate={onNavigate} />}

      {!collapsed && (
        <Link
          href="/conversations"
          onClick={onNavigate}
          className={cn(
            "mt-3 flex min-h-10 items-center gap-1.5 rounded-[11px] px-2.5 text-sm font-semibold transition-colors",
            here.startsWith("/conversations") ? "bg-soft-2 text-ink" : "text-ink-2 hover:bg-soft"
          )}
        >
          Toutes les conversations <ArrowRight className="size-4" />
        </Link>
      )}

      </div>

      <div className="flex w-full flex-col gap-0.5 border-t border-line pt-3">
        {/* Paramètres (and the company's settings, for its admin) open from the account menu, as in
            ChatGPT: no Administration button here any more (Leslie, 24/10). */}
        <AccountMenu collapsed={collapsed} />

        <a
          href="https://yelema.ai"
          target="_blank"
          rel="noopener"
          className="mt-1 flex items-center justify-center gap-1.5 py-1.5 text-[12.5px] text-ink-3 hover:text-ink"
        >
          {collapsed ? (
            // The long logo does not fit the rail: the Y alone, whole.
            <Image src="/yelema_y_violet.svg" alt="Powered by Yelema" width={28} height={28} className="size-7" />
          ) : (
            <>
              Powered by
              <Image src="/yelema-long.png" alt="Yelema" width={76} height={22} className="h-[22px] w-auto" />
            </>
          )}
        </a>
      </div>
    </aside>
  );
}

// Menu folded: every entry is the same square, centred in the rail, so icons and faces line up.
const RAIL_SQUARE = "size-11 min-h-0 shrink-0 justify-center px-0";
// Past this many Experts, the cycles start folded (Leslie, 01/11).
// A cycle starts folded when the member has more Experts than this, except the cycle of the Expert on screen.
const FOLD_FROM = 4;
// A cycle holds four Experts at most (Leslie, 02/11): all their faces fit.
const FACES = 4;
const CYCLES_KEY = "yelema.cycles-fold";


// The latest conversations of the chat d'entreprise, under a lock: private to the company. An
// Expert's conversations stay in its space. A failed read shows nothing rather than an error here.
function CompanyChats({ agentId, pathname, onNavigate }: { agentId: string; pathname: string; onNavigate?: () => void }) {
  const all = useCompanySessions(agentId);
  const { marks } = useChatMarks();
  // Pinned first, then the latest; archived ones stay in « Toutes les conversations ».
  const { pinned, rest } = arrange(all, (s) => convKey(agentId, null, s.session_id), marks);
  const sessions = [...pinned, ...rest].slice(0, Math.max(6, pinned.length));
  const pinnedIds = new Set(pinned.map((s) => s.session_id));
  const home = `/experts/${agentId}/chat`;
  // Pinned first, then by day (Myriel, Leslie 30/10): Aujourd'hui, Hier, Cette semaine, Plus ancien.
  const groups = byDay(sessions, pinnedIds);
  return (
    <>
      <div className="mt-3 flex items-center gap-1">
        <Link
          href={home}
          onClick={onNavigate}
          className={cn(
            "flex min-h-8 flex-1 items-center gap-1.5 rounded-[11px] px-2.5 text-xs font-semibold uppercase tracking-wide",
            pathname === home ? "text-ink" : "text-ink-3 hover:text-ink"
          )}
        >
          <Lock className="size-3.5" strokeWidth={2.2} />
          Chat d’entreprise
        </Link>
        {/* A new conversation of the chat d'entreprise, from anywhere. */}
        <Link
          href={home}
          onClick={onNavigate}
          aria-label="Nouvelle conversation du chat d’entreprise"
          title="Nouvelle conversation du chat d’entreprise"
          className="grid size-9 shrink-0 place-items-center rounded-[10px] text-ink-3 hover:bg-soft hover:text-ink"
        >
          <Plus className="size-4" />
        </Link>
      </div>
      {sessions.length === 0 && <p className="px-2.5 pb-1 text-[13px] text-ink-3">Vos conversations apparaîtront ici.</p>}
      {groups.map(({ label, rows }) => (
        <div key={label} className="flex flex-col gap-0.5">
          {label && <p className="px-2.5 pt-2 pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">{label}</p>}
          {rows.map((s) => (
        <Link
          key={s.session_id}
          href={`${home}?session=${encodeURIComponent(s.session_id)}`}
          onClick={onNavigate}
          title={s.title || "Nouvelle conversation"}
          className="flex min-h-9 items-center gap-1.5 rounded-[11px] px-2.5 text-[13px] font-medium text-ink-2 hover:bg-soft"
        >
          <span className="truncate">{s.title || "Nouvelle conversation"}</span>
          {pinnedIds.has(s.session_id) && <Pin className="ml-auto size-3.5 shrink-0 text-ink-3" aria-label="Épinglée" />}
        </Link>
          ))}
        </div>
      ))}
    </>
  );
}

const DAY = 86_400_000;

function byDay<S extends { session_id: string; last_active: number }>(rows: S[], pinned: Set<string>): { label: string; rows: S[] }[] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const today = start.getTime();
  const label = (s: S) => {
    if (pinned.has(s.session_id)) return "";
    const at = toMs(s.last_active);
    if (at >= today) return "Aujourd’hui";
    if (at >= today - DAY) return "Hier";
    if (at >= today - 6 * DAY) return "Cette semaine";
    return "Plus ancien";
  };
  const out: { label: string; rows: S[] }[] = [];
  for (const s of rows) {
    const l = label(s);
    const g = out.find((x) => x.label === l);
    if (g) g.rows.push(s);
    else out.push({ label: l, rows: [s] });
  }
  return out;
}

// Djénéba alone first, never folded; then one group per cycle in the catalogue's order (the experts
// arrive sorted by expertRank); an Expert the catalogue and the back office both leave without a cycle last.
function groupByCycle(experts: Expert[]): { cycle: { key: string; label: string } | null; experts: Expert[] }[] {
  const lead = experts.filter(isDjeneba);
  const groups: { cycle: { key: string; label: string } | null; experts: Expert[] }[] = [];
  const loose: Expert[] = [];
  for (const e of experts) {
    if (isDjeneba(e)) continue;
    if (!e.cycle) {
      loose.push(e);
      continue;
    }
    const g = groups.find((x) => x.cycle?.key === e.cycle!.key);
    if (g) g.experts.push(e);
    else groups.push({ cycle: e.cycle, experts: [e] });
  }
  return [{ cycle: null, experts: lead }, ...groups, { cycle: null, experts: loose }].filter((g) => g.experts.length > 0);
}
