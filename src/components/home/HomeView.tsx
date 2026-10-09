"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, MessageCircle, Send } from "lucide-react";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { ExpertAvatar } from "@/components/experts/ExpertAvatar";
import { ExpertMedia } from "@/components/experts/ExpertMedia";
import { useExpertsContext } from "@/components/experts/ExpertsProvider";
import { useCatalogue } from "@/components/experts/useCatalogue";
import { agentTabPath } from "@/lib/expert-tabs";
import type { CatalogueExpert, Expert } from "@/lib/types";
import { cn } from "@/lib/utils";

function today(): string {
  const s = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// How wide a team card is at each breakpoint (1, 2, 3 then 4 per row).
const CARD_SIZES = "(min-width: 80rem) 300px, (min-width: 64rem) 33vw, (min-width: 40rem) 50vw, 100vw";

const expertId = (e: Expert) => `${e.agentId}:${e.profileId}`;

// One expert's card: full-body portrait (the looping video on hover), name, title, tagline,
// "Écrire". The portrait comes from the catalogue; without one the card shows the expert's initial.
function ExpertCard({ expert, entry }: { expert: Expert; entry: CatalogueExpert | null }) {
  const href = agentTabPath(expert.agentId, "chat", expert.profileId);
  const [hovered, setHovered] = useState(false);
  return (
    <div className="group flex flex-col overflow-hidden rounded-card border border-line bg-surface transition-shadow hover:shadow-[0_20px_40px_-26px_rgba(23,17,43,.45)]">
      <Link
        href={href}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="relative block aspect-[4/5] overflow-hidden bg-[#8D68FA]/30"
      >
        <ExpertMedia
          name={expert.displayName}
          image={entry?.portraitUrl ?? expert.photoUrl ?? null}
          videoUrl={entry?.videoUrl}
          hovered={hovered}
          sizes={CARD_SIZES}
        />
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-display text-[22px] font-bold tracking-tight text-ink">{expert.displayName}</h3>
        <p className="text-sm text-ink-3">{expert.title ?? expert.role ?? expert.agentName ?? ""}</p>
        <p className="mt-3 line-clamp-2 flex-1 text-sm text-ink-2">{expert.tagline ?? ""}</p>
        <Link
          href={href}
          className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-line text-[15px] font-semibold text-ink hover:bg-soft"
        >
          <MessageCircle className="h-4 w-4" /> Écrire
        </Link>
      </div>
    </div>
  );
}

// What the home shows while the back office installs the first experts. The list is read again on
// its own (useExperts), so the team replaces this card without a reload.
function Installing() {
  return (
    <section role="status" className="mt-4 max-w-2xl rounded-[22px] border border-line bg-surface p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-tint text-brand-ink">
          <Loader2 className="h-5 w-5 animate-spin" />
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-lg font-bold text-ink">Votre équipe s’installe</h3>
          <p className="mt-1 text-sm text-ink-2">
            Nous préparons vos experts. Cela prend quelques minutes : ils apparaîtront ici dès qu’ils seront prêts,
            sans que vous ayez à recharger la page.
          </p>
        </div>
      </div>
    </section>
  );
}

// Accueil: greeting, "Demander à mon équipe" (chips pick the expert; sending opens that expert's
// chat with the message on its way), then the team. Everything shown is what is installed for
// this user; the catalogue only dresses it.
export function HomeView() {
  const router = useRouter();
  const { current, userEmail } = useWorkspace();
  const { experts, loading, unreadable, installing } = useExpertsContext();
  const { catalogue } = useCatalogue(current?.id);
  const [picked, setPicked] = useState<string | null>(null);
  const [text, setText] = useState("");

  const entries = useMemo(() => new Map(catalogue.experts.map((e) => [e.key, e])), [catalogue]);
  // The expert addressed by default: the catalogue's, when it is installed, else the first one.
  const fallback = experts.find((e) => e.catalogueKey && e.catalogueKey === catalogue.defaultExpertKey) ?? experts[0];
  const to = experts.find((e) => expertId(e) === picked) ?? fallback ?? null;
  const suggestions = (to?.catalogueKey && entries.get(to.catalogueKey)?.suggestions) || [];
  const hello = userEmail.split("@")[0];

  function send(message: string) {
    const m = message.trim();
    if (!m || !to) return;
    router.push(`${agentTabPath(to.agentId, "chat", to.profileId)}?q=${encodeURIComponent(m)}`);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(text);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-24 pt-6 sm:px-8">
      <p className="text-[15px] text-ink-3">{today()}</p>
      <h1 className="mt-1 font-display text-[34px] font-bold tracking-tight text-ink sm:text-[38px]">Bonjour {hello}</h1>

      {to && (
        <>
          <section className="mt-5 rounded-[22px] border border-line bg-surface p-4 shadow-[0_8px_30px_rgb(48_22_103_/_0.05)]">
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <span className="shrink-0 text-sm text-ink-3">À</span>
              {experts.map((e) => (
                <button
                  key={expertId(e)}
                  type="button"
                  onClick={() => setPicked(expertId(e))}
                  className={cn(
                    "flex h-9 shrink-0 items-center gap-2 rounded-full border pl-1 pr-3 text-[13px] font-semibold transition-colors",
                    expertId(e) === expertId(to) ? "border-brand/40 bg-tint text-brand-ink" : "border-line bg-surface text-ink-2 hover:bg-soft"
                  )}
                >
                  <ExpertAvatar expert={{ ...e, gateway: null }} size="xs" />
                  {e.displayName}
                </button>
              ))}
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              rows={3}
              placeholder={`Que voulez-vous confier à ${to.displayName} ?`}
              className="mt-3 w-full resize-none bg-transparent px-1 text-[16px] text-ink placeholder:text-ink-3 focus:outline-none"
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => send(text)}
                disabled={!text.trim()}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-5 text-[15px] font-semibold text-on-brand hover:opacity-90 disabled:opacity-40"
              >
                <Send className="h-4 w-4" /> Envoyer
              </button>
            </div>
          </section>

          {suggestions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-dashed border-line bg-surface px-3.5 py-2 text-[13px] font-semibold text-ink-2 hover:border-brand/30 hover:text-ink"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <h2 className="mt-10 font-display text-[22px] font-bold tracking-tight text-ink">
        Mon équipe{experts.length > 0 ? ` (${experts.length})` : ""}
      </h2>
      {installing && experts.length > 0 && (
        <p role="status" className="mt-2 flex items-center gap-2 text-sm text-ink-3">
          <Loader2 className="h-4 w-4 animate-spin" /> D’autres experts sont en cours d’installation.
        </p>
      )}
      {installing && experts.length === 0 ? (
        <Installing />
      ) : loading && experts.length === 0 ? (
        <p className="mt-4 text-sm text-ink-3">Chargement de votre équipe…</p>
      ) : experts.length === 0 ? (
        <p className="mt-4 max-w-xl text-sm text-ink-2">
          {unreadable > 0
            ? "Votre équipe n’est pas joignable pour le moment. Réessayez dans un instant."
            : "Votre équipe s’installe. Vos experts apparaîtront ici dès qu’ils seront prêts."}
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {experts.map((e) => (
            <ExpertCard key={expertId(e)} expert={e} entry={(e.catalogueKey && entries.get(e.catalogueKey)) || null} />
          ))}
        </div>
      )}
    </div>
  );
}
