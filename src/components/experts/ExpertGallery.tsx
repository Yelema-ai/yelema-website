"use client";

import { useRef, useState, useSyncExternalStore } from "react";
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
import { EXPERTS, EXPERT_CATEGORIES, type Expert } from "@/config/experts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Direction: Crown,
  "Marketing et design": Megaphone,
  "Ventes et clients": Handshake,
  RH: Users,
  "Finance et investissement": Landmark,
  Données: PieChart,
  Juridique: Scale,
};

// Hover videos only with a real mouse, and never when the user asked for less motion.
const VIDEO_QUERY = "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)";

function subscribeVideoQuery(onChange: () => void) {
  const mq = window.matchMedia(VIDEO_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function useHoverVideo() {
  return useSyncExternalStore(
    subscribeVideoQuery,
    () => window.matchMedia(VIDEO_QUERY).matches,
    () => false
  );
}

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
        "inline-flex h-[30px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-[11px] text-[13px] font-semibold transition-colors",
        active ? "border-transparent bg-tint text-brand" : "border-line bg-surface text-ink-2 hover:bg-soft"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      <span className="font-medium text-ink-3">{count}</span>
    </button>
  );
}

// One tall card: the full-body portrait, swapped for the looping video while the mouse is over it.
function ExpertCard({ expert, video }: { expert: Expert; video: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hovered = useRef(false);
  const [playing, setPlaying] = useState(false);

  function enter() {
    hovered.current = true;
    videoRef.current?.play().catch(() => {});
  }

  function leave() {
    hovered.current = false;
    videoRef.current?.pause();
    setPlaying(false);
  }

  return (
    <article
      onMouseEnter={video ? enter : undefined}
      onMouseLeave={video ? leave : undefined}
      className="relative aspect-[4/5] overflow-hidden rounded-[24px] bg-[#8E6FB0] text-white sm:aspect-[400/698]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/experts/pied/${expert.key}.jpg`}
        alt=""
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover object-top"
      />
      {video && (
        <video
          ref={videoRef}
          src={`/experts/vid/${expert.key}.mp4`}
          muted
          loop
          playsInline
          preload="none"
          aria-hidden
          onPlaying={() => setPlaying(hovered.current)}
          className={cn(
            "absolute inset-0 h-full w-full object-cover object-top opacity-0 transition-opacity duration-300",
            playing && "opacity-100"
          )}
        />
      )}
      <div
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(23,10,40,0)_42%,rgba(23,10,40,0.9)_82%)]"
      />
      <Link href={`/experts/${expert.key}/fiche`} tabIndex={-1} aria-hidden className="absolute inset-0" />

      <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1.5 text-[12.5px] font-semibold text-ok">
        <Check className="h-3.5 w-3.5" strokeWidth={2.6} />
        Dans votre équipe
      </span>

      <div className="pointer-events-none absolute inset-x-[18px] bottom-[18px] flex flex-col gap-[3px]">
        <h2 className="font-display text-2xl font-bold tracking-[-0.01em]">{expert.name}</h2>
        <p className="text-[13.5px] font-semibold text-[#D9CCFF]">{expert.role}</p>
        <p className="mt-1.5 text-sm leading-snug text-white/90">{expert.tagline}</p>
        <div className="pointer-events-auto mt-3 flex flex-wrap gap-2">
          <Button asChild size="sm" className="h-9 rounded-full bg-white px-3.5 text-brand hover:bg-soft">
            <Link href={`/experts/${expert.key}`}>
              <MessageCircle />
              Écrire à {expert.name}
            </Link>
          </Button>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="h-9 rounded-full border-white/40 bg-white/10 px-3.5 text-white hover:bg-white/20"
          >
            <Link href={`/experts/${expert.key}/fiche`}>Voir la fiche</Link>
          </Button>
        </div>
      </div>
    </article>
  );
}

// The team showcase: every expert is already in the client's team, filtered by trade.
export function ExpertGallery() {
  const [category, setCategory] = useState<string | null>(null);
  const video = useHoverVideo();
  const shown = category ? EXPERTS.filter((e) => e.category === category) : EXPERTS;
  const categories = EXPERT_CATEGORIES.map((c) => ({
    label: c,
    count: EXPERTS.filter((e) => e.category === c).length,
  })).filter((c) => c.count > 0);

  return (
    <div>
      <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em] text-ink md:text-[34px]">
        Votre équipe d’experts
      </h1>
      <p className="mt-1.5 text-base text-ink-2">Les experts de votre entreprise, par métier.</p>

      <div
        role="group"
        aria-label="Filtrer par métier"
        className="mt-5 flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] md:flex-wrap md:overflow-visible"
      >
        <FilterChip
          label="Tous"
          count={EXPERTS.length}
          icon={Sparkles}
          active={category === null}
          onClick={() => setCategory(null)}
        />
        {categories.map((c) => (
          <FilterChip
            key={c.label}
            label={c.label}
            count={c.count}
            icon={CATEGORY_ICONS[c.label] ?? Sparkles}
            active={category === c.label}
            onClick={() => setCategory(c.label)}
          />
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {shown.map((e) => (
          <ExpertCard key={e.key} expert={e} video={video} />
        ))}
      </div>
    </div>
  );
}
