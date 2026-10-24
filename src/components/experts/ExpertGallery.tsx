"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Check,
  Crown,
  Handshake,
  Landmark,
  Megaphone,
  MessageCircle,
  PieChart,
  Scale,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { ExpertMedia } from "@/components/experts/ExpertMedia";
import { useCatalogue } from "@/components/experts/useCatalogue";
import { Button } from "@/components/ui/button";
import { agentTabPath } from "@/lib/expert-tabs";
import { expertThemes } from "@/lib/expert-themes";
import type { CatalogueResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

type Entry = CatalogueResponse["experts"][number];

// An icon per theme, found by a word of its label: a theme the back office adds later simply gets
// the default icon.
const CATEGORY_ICONS: [RegExp, LucideIcon][] = [
  [/direction/i, Crown],
  [/marketing|design|contenu/i, Megaphone],
  [/vente|client|commerc/i, Handshake],
  [/rh|ressources|recrut/i, Users],
  [/financ|compta|invest/i, Landmark],
  [/donn|data|opérat/i, PieChart],
  [/jurid|conform|légal|legal/i, Scale],
];

const categoryIcon = (label: string): LucideIcon => CATEGORY_ICONS.find(([word]) => word.test(label))?.[1] ?? Sparkles;

function FilterChip({
  label,
  count,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  count: number;
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-[30px] max-sm:h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-[11px] text-[13px] font-semibold transition-colors",
        active ? "border-transparent bg-tint text-brand-ink" : "border-line bg-surface text-ink-2 hover:bg-soft"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      <span className="font-medium text-ink-3">{count}</span>
    </button>
  );
}

// One tall card: the full-body portrait, swapped for the looping video while the mouse is over it,
// with the expert's name and role on top. An expert already in the user's team opens its chat; the
// others only show their sheet (adding one is done with Yelema).
function ExpertCard({ expert }: { expert: Entry }) {
  const mine = expert.installed[0] ?? null;
  const fiche = `/recruter/${expert.key}`;
  const [hovered, setHovered] = useState(false);
  return (
    // Fixed colors on purpose: the card is a picture with white text over it, in both themes.
    <article
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative aspect-[4/5] overflow-hidden rounded-card bg-[#8E6FB0] text-white sm:aspect-[400/698]"
    >
      <ExpertMedia
        name={expert.name}
        image={expert.portraitUrl ?? expert.avatarUrl}
        videoUrl={expert.videoUrl}
        hovered={hovered}
        sizes="(min-width: 80rem) 300px, (min-width: 64rem) 33vw, (min-width: 40rem) 50vw, 100vw"
      />
      <div aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,rgba(23,10,40,0)_42%,rgba(23,10,40,0.9)_82%)]" />
      <Link href={fiche} tabIndex={-1} aria-hidden className="absolute inset-0" />

      {mine && (
        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1.5 text-[12.5px] font-semibold text-[#137A4B]">
          <Check className="h-3.5 w-3.5" strokeWidth={2.6} />
          Dans votre équipe
        </span>
      )}

      <div className="pointer-events-none absolute inset-x-[18px] bottom-[18px] flex flex-col gap-[3px]">
        <h2 className="font-display text-2xl font-bold tracking-[-0.01em]">{expert.name}</h2>
        {expert.role && <p className="text-[13.5px] font-semibold text-[#D9CCFF]">{expert.role}</p>}
        {expert.tagline && <p className="mt-1.5 text-sm leading-snug text-white/90">{expert.tagline}</p>}
        {/* Two buttons of one size, stacked: the chat first for an expert of the team, else the sheet. */}
        <div className="pointer-events-auto mt-3 flex flex-col gap-2">
          {mine && (
            <Button asChild className="h-10 w-full rounded-full bg-white px-4 text-[#301667] hover:bg-white/90">
              <Link href={agentTabPath(mine.agentId, "chat", mine.profileId)}>
                <MessageCircle />
                Écrire à {expert.name}
              </Link>
            </Button>
          )}
          <Button
            asChild
            variant="outline"
            className={
              mine
                ? "h-10 w-full rounded-full border-white/50 bg-white/10 px-4 text-white hover:bg-white/20 hover:text-white"
                : "h-10 w-full rounded-full border-transparent bg-white px-4 text-[#301667] hover:bg-white/90 hover:text-[#301667]"
            }
          >
            <Link href={fiche}>Voir sa fiche</Link>
          </Button>
        </div>
      </div>
    </article>
  );
}

// The showcase of every expert Yelema offers, filtered by trade, with the user's own marked.
export function ExpertGallery() {
  const { current } = useWorkspace();
  const { catalogue, loading } = useCatalogue(current?.id);
  const [category, setCategory] = useState<string | null>(null);

  // The themes: the back office's when it files every expert, else the stopgap list.
  const { themes: categories, themeOf } = useMemo(() => expertThemes(catalogue.categories, catalogue.experts), [catalogue]);
  const shown = category ? catalogue.experts.filter((e) => themeOf.get(e.key) === category) : catalogue.experts;

  return (
    <div>
      <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em] text-ink md:text-[34px]">
        Les Experts Yelema
      </h1>
      <p className="mt-1.5 text-base text-ink-2">Ceux de votre équipe, et ceux qui peuvent la rejoindre.</p>

      {loading ? (
        <p className="mt-6 text-sm text-ink-3">Chargement…</p>
      ) : !catalogue.available || catalogue.experts.length === 0 ? (
        <p className="mt-6 max-w-xl text-sm text-ink-2">
          Le catalogue des Experts n’est pas disponible pour le moment. Vos Experts restent accessibles depuis le menu.
        </p>
      ) : (
        <>
          {categories.length > 1 && (
            <div
              role="group"
              aria-label="Filtrer par thème"
              className="mt-5 flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] md:flex-wrap md:overflow-visible"
            >
              <FilterChip
                label="Tous"
                count={catalogue.experts.length}
                icon={Sparkles}
                active={category === null}
                onClick={() => setCategory(null)}
              />
              {categories.map((c) => (
                <FilterChip
                  key={c.key}
                  label={c.label}
                  count={c.count}
                  icon={categoryIcon(c.label)}
                  active={category === c.key}
                  onClick={() => setCategory(c.key)}
                />
              ))}
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {shown.map((e) => (
              <ExpertCard key={e.key} expert={e} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
